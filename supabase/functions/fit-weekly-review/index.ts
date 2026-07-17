// Edge Function: fit-weekly-review  (PRD F8 — weekly AI coach review)
// Runs every Sunday 19:00 WIB (see supabase/schedules.sql). Reads the last
// 14 days per user, applies progression + calorie rules (server-side mirror
// of the client rules), writes a human-tone coach note, and records the
// changelog. Deploy with verify_jwt = false and guard with CRON_SECRET.
//
//   supabase functions deploy fit-weekly-review --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  CRON_SECRET=...
//
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { claude, MODELS } from "../_shared/claude.ts";
import { adjustCalories, evaluateProgression, type Goal, type Session } from "../_shared/progression.ts";

const DAYS = 14;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Guard: only the scheduler (or an operator) with the secret may run this.
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);

  const sb = adminClient();
  const since = isoDaysAgo(DAYS);

  try {
    // Which users to review. Multi-user: distinct user_ids on fit_settings.
    // Single-user prototype: user_id is null → one pass.
    const { data: settingsRows } = await sb.from("fit_settings").select("user_id");
    const userIds = uniq((settingsRows ?? []).map((r: { user_id: string | null }) => r.user_id));
    if (userIds.length === 0) userIds.push(null);

    const summaries: unknown[] = [];
    for (const userId of userIds) {
      summaries.push(await reviewUser(sb, userId, since));
    }
    return json({ reviewed: summaries.length, results: summaries });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function reviewUser(sb: ReturnType<typeof adminClient>, userId: string | null, since: string) {
  const scope = <T>(q: T): T => (userId ? (q as { eq: (c: string, v: string) => T }).eq("user_id", userId) : q);

  // --- Pull the window --------------------------------------------------
  const [{ data: setLogs }, { data: exercises }, { data: body }, { data: foods }, { data: settingsArr }] = await Promise.all([
    scope(sb.from("fit_set_logs").select("*").gte("log_date", since)),
    scope(sb.from("fit_exercises").select("*").eq("active", true)),
    scope(sb.from("fit_body_metrics").select("*").gte("log_date", since).order("log_date")),
    scope(sb.from("fit_food_logs").select("*").gte("log_date", since)),
    scope(sb.from("fit_settings").select("*")),
  ]);

  const settings = Object.fromEntries((settingsArr ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const targets = (settings.targets as { kcal?: number; protein?: number }) ?? { kcal: 2150, protein: 155 };
  const profile = (settings.profile as { goal?: Goal; language?: string; name?: string }) ?? {};
  const goal: Goal = profile.goal ?? "cut";

  // --- Progression per exercise ----------------------------------------
  const byExercise = groupSessions(setLogs ?? []); // exercise_id -> Session[] (chronological)
  const changes: Array<{ kind: string; label: string; detail: string }> = [];
  for (const ex of exercises ?? []) {
    const sessions: Session[] = byExercise[ex.id] ?? [];
    if (sessions.length === 0) continue;
    const r = evaluateProgression(ex, sessions);
    if (r.action !== "hold" && r.newWeight !== Number(ex.current_weight)) {
      const upd = sb.from("fit_exercises").update({ current_weight: r.newWeight }).eq("id", ex.id);
      await (userId ? upd.eq("user_id", userId) : upd);
      changes.push({ kind: "progression", label: `${ex.name} → ${r.newWeight} kg`, detail: r.reason });
    }
  }

  // --- Calorie adjustment ----------------------------------------------
  const weeklyChange = weeklyWeightChange(body ?? []);
  const bw = latestWeight(body ?? []) ?? 75;
  const cal = adjustCalories(targets.kcal ?? 2150, weeklyChange, goal, bw);
  if (cal.delta !== 0) {
    const newTargets = { ...targets, kcal: cal.newTarget };
    await sb.from("fit_settings").upsert(
      { key: "targets", value: newTargets, ...(userId ? { user_id: userId } : {}) },
      { onConflict: userId ? "user_id,key" : "key" },
    );
    changes.push({ kind: "calories", label: `Calories → ${cal.newTarget} (${cal.delta > 0 ? "+" : ""}${cal.delta})`, detail: cal.reason });
  }

  // --- Weekly stats: this week vs the previous week ---------------------
  const weekAgo = isoDaysAgo(7);
  const daysPerWeek = (profile as { daysPerWeek?: number }).daysPerWeek ?? 6;
  const trainingDays = uniq((setLogs ?? []).filter((s: { log_date: string }) => s.log_date >= weekAgo).map((s: { log_date: string }) => s.log_date)).length;
  let volThis = 0, volPrev = 0;
  for (const s of (setLogs ?? []) as Array<{ log_date: string; weight: number; reps: number }>) {
    const v = Number(s.weight) * Number(s.reps);
    if (s.log_date >= weekAgo) volThis += v; else volPrev += v;
  }
  const stats = {
    sessions: trainingDays,
    sessionsTarget: daysPerWeek,
    adherencePct: Math.min(100, Math.round((trainingDays / daysPerWeek) * 100)),
    volumePct: volPrev > 0 ? Math.round(((volThis - volPrev) / volPrev) * 100) : 0,
    proteinAvg: Math.round(avgDailyProtein((foods ?? []).filter((f: { log_date: string }) => f.log_date >= weekAgo))),
    proteinFloor: targets.protein ?? 155,
    weightChange: round1(weeklyChange),
  };

  // --- Coach note (Claude) ---------------------------------------------
  const facts = { name: profile.name ?? "there", language: profile.language ?? "en", goal, stats, changes };
  const note = await writeCoachNote(facts);

  await sb.from("fit_coach_notes").insert({
    title: note.title, body: note.body, data: { stats, changes },
    ...(userId ? { user_id: userId } : {}),
  });

  return { userId, stats, changes, note };
}

async function writeCoachNote(facts: Record<string, unknown>): Promise<{ title: string; body: string }> {
  const system = `You are Gaspol's personal trainer. Write a SHORT weekly review note (title + 2-3 sentences),
warm and direct, never shaming. Explain the "why" behind any change. Write in the user's language
("id" = Bahasa Indonesia, else English). Return ONLY JSON: {"title","body"}.`;
  try {
    const reply = await claude({
      model: MODELS.review, system, maxTokens: 400,
      content: `This week's facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
    });
    const m = reply.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
  } catch (_) { /* fall through to a deterministic note */ }
  // Fallback so the review still posts if the AI call fails.
  const st = (facts.stats as { sessions?: number; weightChange?: number }) ?? {};
  const chg = (facts.changes as Array<{ label: string }>) ?? [];
  return {
    title: st.sessions ? "Another week logged." : "Let's restart this week.",
    body: `${st.sessions ?? 0} sessions in, weight change ${st.weightChange ?? 0} kg. ` +
      (chg.length ? `Changes: ${chg.map((c) => c.label).join("; ")}.` : "No plan changes — keep pushing reps."),
  };
}

/* ---------- helpers -------------------------------------------------- */
function isoDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function uniq<T>(a: T[]): T[] { return [...new Set(a)]; }
function round1(n: number): number { return Math.round(n * 10) / 10; }

function groupSessions(setLogs: Array<{ exercise_id: number; log_date: string; weight: number; reps: number }>): Record<number, Session[]> {
  const byExDate: Record<string, { weight: number; reps: number }[]> = {};
  for (const s of setLogs) {
    const k = `${s.exercise_id}|${s.log_date}`;
    (byExDate[k] ||= []).push({ weight: Number(s.weight), reps: Number(s.reps) });
  }
  const out: Record<number, Session[]> = {};
  for (const [k, sets] of Object.entries(byExDate)) {
    const [exId, date] = k.split("|");
    (out[Number(exId)] ||= []).push({ date, sets });
  }
  for (const id of Object.keys(out)) out[Number(id)].sort((a, b) => (a.date! < b.date! ? -1 : 1));
  return out;
}
function weeklyWeightChange(body: Array<{ log_date: string; weight_kg: number | null }>): number {
  const pts = body.filter((b) => b.weight_kg != null);
  if (pts.length < 2) return 0;
  const latest = Number(pts[pts.length - 1].weight_kg);
  // compare to the closest point ~7 days earlier
  const cutoff = isoDaysAgo(7);
  const earlier = pts.find((p) => p.log_date >= cutoff) ?? pts[0];
  return latest - Number(earlier.weight_kg);
}
function latestWeight(body: Array<{ weight_kg: number | null }>): number | null {
  const pts = body.filter((b) => b.weight_kg != null);
  return pts.length ? Number(pts[pts.length - 1].weight_kg) : null;
}
function avgDailyProtein(foods: Array<{ log_date: string; protein: number }>): number {
  const byDay: Record<string, number> = {};
  for (const f of foods) byDay[f.log_date] = (byDay[f.log_date] ?? 0) + Number(f.protein);
  const days = Object.values(byDay);
  return days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0;
}
