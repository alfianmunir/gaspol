/* Server-side mirror of /progression.js (PRD F3). Keep the two in sync.
   Deno/TypeScript so the weekly-review function can validate progression
   with the exact rules the client applied instantly. */

export const MIN_WEIGHT = 0;

export interface SetEntry { weight: number; reps: number; }
export interface Session { date?: string; sets: SetEntry[]; }
export interface Exercise {
  id?: number;
  current_weight: number;
  increment: number;
  is_compound: boolean;
  rep_low: number;
  rep_high: number;
  target_sets?: number;
}
export type Goal = "cut" | "recomp" | "bulk";
export interface ProgressionResult { action: "increase" | "deload" | "hold"; newWeight: number; reason: string; }

export function clearedTopOfRange(sets: SetEntry[], repHigh: number): boolean {
  const working = sets.filter((s) => Number.isFinite(s.reps));
  return working.length > 0 && working.every((s) => s.reps >= repHigh);
}

export function roundToStep(weight: number): number {
  return Math.max(MIN_WEIGHT, Math.round(weight * 4) / 4);
}

function topWeight(sets: SetEntry[]): number {
  return sets.reduce((m, s) => Math.max(m, Number(s.weight) || 0), 0);
}

export function evaluateProgression(exercise: Exercise, sessions: Session[]): ProgressionResult {
  const cur = Number(exercise.current_weight) || 0;
  const inc = Number(exercise.increment) || (exercise.is_compound ? 2.5 : 1);
  const last = sessions[sessions.length - 1];

  if (!last || !last.sets || last.sets.length === 0) {
    return { action: "hold", newWeight: cur, reason: "No sets logged yet — holding prescription." };
  }

  if (clearedTopOfRange(last.sets, exercise.rep_high)) {
    const next = roundToStep(cur + inc);
    const delta = next - cur;
    const verb = delta >= 0 ? `+${delta}` : `${delta}`;
    return { action: "increase", newWeight: next, reason: `Cleared ${exercise.rep_high} reps on all sets — ${verb} kg next session.` };
  }

  if (sessions.length >= 2) {
    const prev = sessions[sessions.length - 2];
    const stalledBoth =
      !clearedTopOfRange(last.sets, exercise.rep_high) &&
      !clearedTopOfRange(prev.sets || [], exercise.rep_high) &&
      topWeight(last.sets) <= cur && topWeight(prev.sets || []) <= cur;
    if (stalledBoth) {
      const next = roundToStep(cur * 0.9);
      return { action: "deload", newWeight: next, reason: `Stalled 2 sessions — deloading 10% to ${next} kg, then rebuild.` };
    }
  }

  return { action: "hold", newWeight: cur, reason: "On track — same weight, keep pushing reps." };
}

export function adjustCalories(currentTarget: number, weeklyChangeKg: number, goal: Goal, bodyweightKg = 75) {
  const pctWeek = (weeklyChangeKg / bodyweightKg) * 100;
  const SAFE_FLOOR = Math.round(bodyweightKg * 22);
  let delta = 0;
  let reason = "Trend on target — calories unchanged.";

  if (goal === "cut") {
    if (pctWeek > -0.3) { delta = -75; reason = "Loss slower than target — trimming the deficit."; }
    else if (pctWeek < -0.9) { delta = +75; reason = "Dropping too fast — easing the deficit to protect muscle."; }
  } else if (goal === "bulk") {
    if (pctWeek < 0.15) { delta = +75; reason = "Gain stalled — nudging calories up."; }
    else if (pctWeek > 0.5) { delta = -75; reason = "Gaining too fast — dialing back to stay lean."; }
  } else {
    if (pctWeek > 0.3) { delta = -75; reason = "Creeping up — small trim to hold weight."; }
    else if (pctWeek < -0.3) { delta = +75; reason = "Dropping on a recomp — nudging calories up."; }
  }

  const next = Math.max(SAFE_FLOOR, currentTarget + delta);
  return { newTarget: next, delta: next - currentTarget, reason };
}
