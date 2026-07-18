/* ============================================================
   Gaspol — data layer (Supabase)
   Backend-agnostic access module the UI calls instead of touching
   Supabase directly. Maps 1:1 to the existing fit_* tables, scopes
   every query to the signed-in user, and queues workout writes to
   IndexedDB so logging works offline in a basement gym (PRD F2/§8).

   Zero-build usage (classic script):
     <script src="./config.js"></script>   // sets window.GASPOL_CONFIG
     <script type="module">
       import { GaspolData } from './data.js';
       await GaspolData.init();
       const today = await GaspolData.getTodaySession();
     </script>

   Bundled usage: import { GaspolData } from './data.js' and pass
   { url, anonKey } to init() directly.

   Nothing here runs until init() is called, so the seed-driven demo
   in app.js keeps working untouched until you wire this in.
   ============================================================ */
import { evaluateProgression, adjustCalories } from './progression.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2';
const JKT = 'Asia/Jakarta';

let sb = null;   // Supabase client
let uid = null;  // current user id
let cfg = null;

async function loadConfig(override) {
  if (override) return override;
  if (typeof window !== 'undefined' && window.GASPOL_CONFIG) return window.GASPOL_CONFIG;
  throw new Error('[GaspolData] No config. Create config.js from config.example.js, or pass { url, anonKey } to init().');
}

export const GaspolData = {
  /** Initialise the Supabase client + restore session. Idempotent. */
  async init(override) {
    if (sb) return sb;
    cfg = await loadConfig(override);
    const { createClient } = await import(/* @vite-ignore */ SUPABASE_ESM);
    sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getUser();
    uid = data?.user?.id || null;
    sb.auth.onAuthStateChange((_e, session) => { uid = session?.user?.id || null; });
    OfflineQueue.flushWhenOnline();
    return sb;
  },

  get client() { return sb; },
  get userId() { return uid; },
  isConfigured() { return !!sb; },

  /* ---------- Auth (F10) ---------------------------------- */
  async signInWithGoogle(redirectTo = location.origin) {
    return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  },
  async signInWithEmail(email, password) {
    const res = await sb.auth.signInWithPassword({ email, password });
    uid = res.data?.user?.id || null;
    return res;
  },
  async signOut() { await sb.auth.signOut(); uid = null; },

  /* ---------- Program & today's session (F1/F2) ----------- */
  /**
   * Today's exercises (by weekday) with prescription + each exercise's
   * most recent set log for the "PREV" column.
   * @param {number} [dow] 1=Mon … 7=Sun; defaults to today (Jakarta).
   */
  async getTodaySession(dow) {
    const day = dow || jakartaDow();
    const { data: exercises, error } = await read('fit_exercises')
      .eq('active', true).eq('day_of_week', day).order('sort_order');
    if (error) throw error;

    const ids = (exercises || []).map((e) => e.id);
    const prev = await lastLogsByExercise(ids);

    return {
      session: exercises?.[0]?.session || null,
      exercises: (exercises || []).map((e) => ({
        id: e.id, name: e.name, isCompound: e.is_compound, restSec: e.rest_sec,
        scheme: `${e.target_sets} × ${e.rep_low}–${e.rep_high} @ ${fmtKg(e.current_weight)} kg`,
        prescribed: { sets: e.target_sets, repLow: e.rep_low, repHigh: e.rep_high, weight: Number(e.current_weight) },
        sets: Array.from({ length: e.target_sets }, (_, i) => ({
          setNumber: i + 1, kg: Number(e.current_weight), reps: e.rep_high, prev: prev[e.id]?.[i] || null, done: false,
        })),
      })),
    };
  },

  /* ---------- Workout logging (F2, offline-first) --------- */
  /**
   * Log one set. Optimistic + durable: writes to the IndexedDB queue
   * first (survives no signal), then flushes to Supabase when online.
   */
  async logSet({ exerciseId, setNumber, weight, reps, rpe = null, logDate = today() }) {
    const row = { exercise_id: exerciseId, set_number: setNumber, weight, reps, rpe, log_date: logDate, user_id: uid };
    await OfflineQueue.enqueue('fit_set_logs', row);
    OfflineQueue.flushWhenOnline();
    return row;
  },

  /** Edit a previously-logged set (E4). */
  async editSet({ exerciseId, setNumber, weight, reps, rpe = null, logDate = today() }) {
    const q = table('fit_set_logs').update({ weight, reps, rpe })
      .eq('exercise_id', exerciseId).eq('set_number', setNumber).eq('log_date', logDate).select();
    const { data, error } = await scopeWrite(q);
    if (error) throw error;
    return data;
  },
  /** Delete a logged set (E4). */
  async deleteSet({ exerciseId, setNumber, logDate = today() }) {
    const q = table('fit_set_logs').delete()
      .eq('exercise_id', exerciseId).eq('set_number', setNumber).eq('log_date', logDate);
    const { error } = await scopeWrite(q);
    if (error) throw error;
  },

  /** Apply progression for one exercise after its last set and persist. */
  async applyProgression(exercise, recentSessions) {
    const result = evaluateProgression(exercise, recentSessions);
    if (result.action !== 'hold') {
      const q = table('fit_exercises').update({ current_weight: result.newWeight }).eq('id', exercise.id);
      const { error } = await scopeWrite(q);
      if (error) throw error;
    }
    return result;
  },

  /** Swap suggestions for a busy/missing station (same session for now). */
  async getSwapAlternatives(exerciseId) {
    const { data: cur } = await read('fit_exercises').eq('id', exerciseId).single();
    if (!cur) return [];
    const { data } = await read('fit_exercises')
      .eq('active', true).eq('session', cur.session).neq('id', exerciseId).order('sort_order');
    return data || [];
  },

  /* ---------- Food (F5) ----------------------------------- */
  /** Quick-add library. Global rows (user_id null) + the user's own. */
  async getFoodLibrary() {
    const filter = uid ? `user_id.is.null,user_id.eq.${uid}` : 'user_id.is.null';
    const { data, error } = await table('fit_foods').select('*').or(filter).order('sort_order');
    if (error) throw error;
    return data || [];
  },
  async getFoodDay(logDate = today()) {
    const { data, error } = await read('fit_food_logs').eq('log_date', logDate).order('created_at');
    if (error) throw error;
    const meals = data || [];
    const totals = meals.reduce((t, m) => ({
      kcal: t.kcal + Number(m.kcal), protein: t.protein + Number(m.protein),
      carbs: t.carbs + Number(m.carbs), fat: t.fat + Number(m.fat),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return { meals, totals };
  },
  async logFood({ meal, name, qty = 1, kcal, protein = 0, carbs = 0, fat = 0, logDate = today() }) {
    const { data, error } = await table('fit_food_logs')
      .insert({ meal, name, qty, kcal, protein, carbs, fat, log_date: logDate, user_id: uid }).select().single();
    if (error) throw error;
    return data;
  },
  /** AI photo estimate (premium). Calls the fit-food-estimate Edge Function. */
  async estimateFoodPhoto(fileOrDataUrl) {
    return invokeFn('fit-food-estimate', { image: await toBase64(fileOrDataUrl) });
  },

  /* ---------- Body (F6) ----------------------------------- */
  async getBodyTrend(days = 35) {
    const { data, error } = await read('fit_body_metrics').gte('log_date', daysAgo(days)).order('log_date');
    if (error) throw error;
    return data || [];
  },
  async logWeighIn({ weightKg, bfPct = null, waistCm = null, hipCm = null, chestCm = null, muscleKg = null, notes = null, logDate = today() }) {
    const { data, error } = await table('fit_body_metrics')
      .upsert({ log_date: logDate, weight_kg: weightKg, bf_pct: bfPct, waist_cm: waistCm, hip_cm: hipCm, chest_cm: chestCm, muscle_kg: muscleKg, notes, user_id: uid },
        { onConflict: 'user_id,log_date' }).select().single();
    if (error) throw error;
    return data;
  },
  /** Full 14+ measurement entry (E6). Writes the extended fit_body_metrics columns. */
  async saveBody(m, logDate = today()) {
    const whr = (m.waistCm && m.hipCm) ? Math.round(m.waistCm / m.hipCm * 100) / 100 : null;
    const row = {
      log_date: logDate, user_id: uid, source: 'app',
      weight_kg: m.weightKg ?? null, waist_cm: m.waistCm ?? null, hip_cm: m.hipCm ?? null,
      bf_pct: m.bfPct ?? null, lean_body_mass_kg: m.muscleKg ?? null,
      neck_cm: m.neckCm ?? null, shoulder_cm: m.shoulderCm ?? null, chest_cm: m.chestCm ?? null, abdomen_cm: m.abdomenCm ?? null,
      biceps_l_cm: m.bicepsLCm ?? null, biceps_r_cm: m.bicepsRCm ?? null,
      forearm_l_cm: m.forearmLCm ?? null, forearm_r_cm: m.forearmRCm ?? null,
      thigh_l_cm: m.thighLCm ?? null, thigh_r_cm: m.thighRCm ?? null,
      calf_l_cm: m.calfLCm ?? null, calf_r_cm: m.calfRCm ?? null, whr,
    };
    const { data, error } = await table('fit_body_metrics').upsert(row, { onConflict: 'user_id,log_date' }).select().single();
    if (error) throw error;
    return data;
  },

  /**
   * Latest segmental body-composition scan (E6). Returns the newest
   * fit_body_metrics row carrying a `scan` payload, shaped for the UI's
   * scan card (per-segment muscle/fat in kg + the headline stats).
   */
  async getScan() {
    const { data, error } = await read('fit_body_metrics')
      .not('scan', 'is', null).order('log_date', { ascending: false }).limit(1);
    if (error) throw error;
    const row = (data || [])[0];
    if (!row) return null;
    const s = row.scan || {};
    return {
      date: row.log_date,
      bmi: numOrNull(row.bmi),
      bmr: numOrNull(row.bmr_kcal),
      visceral: numOrNull(row.visceral_fat),
      whr: numOrNull(row.whr),
      bodyAge: s.body_age ?? null,
      musclePct: s.muscle_pct ?? null,
      fatPct: s.fat_pct ?? numOrNull(row.bf_pct),
      segments: mapSegments(s.segments),
    };
  },

  /* ---------- Daily check-in (F7) ------------------------- */
  async getCheckin(logDate = today()) {
    const { data, error } = await read('fit_checkins').eq('log_date', logDate).maybeSingle();
    if (error) throw error;
    return data;
  },
  /** Last N days of check-ins, oldest→newest, for the recovery signal (E8). */
  async getCheckinHistory(days = 7) {
    const { data, error } = await read('fit_checkins')
      .gte('log_date', daysAgo(days)).order('log_date');
    if (error) throw error;
    return (data || []).map((r) => ({
      date: r.log_date,
      sleep: numOrNull(r.sleep_hours),
      energy: r.energy ?? null,
      soreness: r.soreness ?? null,
    }));
  },
  async saveCheckin({ sleepHours, sleepQuality = null, energy, soreness, notes = null, logDate = today() }) {
    const { data, error } = await table('fit_checkins')
      .upsert({ log_date: logDate, sleep_hours: sleepHours, sleep_quality: sleepQuality, energy, soreness, notes, user_id: uid },
        { onConflict: 'user_id,log_date' }).select().single();
    if (error) throw error;
    return data;
  },

  /* ---------- Settings, reminders, coach notes ------------ */
  async getSettings() {
    const { data, error } = await read('fit_settings');
    if (error) throw error;
    return Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  },
  async setSetting(key, value) {
    const { error } = await table('fit_settings').upsert({ key, value, user_id: uid }, { onConflict: 'user_id,key' });
    if (error) throw error;
  },
  /** Account/profile for Settings (F10): fit_settings.profile + auth email. */
  async getProfile() {
    const s = await this.getSettings();
    const pr = s.profile || {};
    let email = null;
    try { const { data } = await sb.auth.getUser(); email = data?.user?.email || null; } catch (e) { /* not signed in */ }
    return { name: pr.name || null, email, premium: !!pr.premium, goal: pr.goal || null, language: pr.language || null };
  },
  async getReminders() { return (await this.getSettings()).reminders || {}; },
  async setReminder(key, on) { const r = await this.getReminders(); r[key] = on; return this.setSetting('reminders', r); },
  async getCoachNotes(limit = 10) {
    const { data, error } = await read('fit_coach_notes').order('note_date', { ascending: false }).limit(limit);
    if (error) throw error;
    return data || [];
  },
  async getLatestReview() { return (await this.getCoachNotes(1))[0] || null; },
  /** Latest weekly review shaped for the Progress screen (F8). */
  async getWeeklyReview() {
    const n = await this.getLatestReview();
    if (!n) return null;
    const d = n.data || {};
    return { title: n.title, body: n.body, date: n.note_date, stats: d.stats || null, changes: d.changes || [] };
  },

  /**
   * Consult (E7). The answer is produced by the embedded, rule-based intent
   * engine in the client (PRD locked decision: no external API). This hook is
   * a place to log the question for future coach context — no-op by default.
   */
  async consult(_question) { return null; },

  /* Preview an adjustment in the UI without a round-trip. */
  previewCalorieAdjust: adjustCalories,
};

/* ============================================================
   Internals
   ============================================================ */
function requireClient() {
  if (!sb) throw new Error('[GaspolData] init() must run before any query.');
  return sb;
}
/** Raw query builder for a table (use for writes). */
function table(name) { return requireClient().from(name); }
/** Read builder scoped to the current user (RLS is the real guard; this is defense-in-depth). */
function read(name) {
  const q = table(name).select('*');
  return uid ? q.eq('user_id', uid) : q;
}
/** Constrain a write to the current user (RLS also enforces it). */
function scopeWrite(query) { return uid ? query.eq('user_id', uid) : query; }

function jakartaDow() {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: JKT, weekday: 'short' }).format(new Date());
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[wd] || 1;
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: JKT }).format(new Date()); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return new Intl.DateTimeFormat('en-CA', { timeZone: JKT }).format(d); }
function fmtKg(v) { const n = Number(v); return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function numOrNull(v) { return v == null ? null : Number(v); }
/** Normalise a scan's segment payload ({muscle_kg,fat_kg}) to the UI's {m,f} shape. */
function mapSegments(seg) {
  if (!seg || typeof seg !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(seg)) {
    if (v && (v.muscle_kg != null || v.fat_kg != null)) out[k] = { m: numOrNull(v.muscle_kg) ?? 0, f: numOrNull(v.fat_kg) ?? 0 };
  }
  return Object.keys(out).length ? out : null;
}

async function lastLogsByExercise(ids) {
  if (!ids.length) return {};
  const { data } = await table('fit_set_logs')
    .select('exercise_id,set_number,weight,reps,log_date')
    .in('exercise_id', ids).order('log_date', { ascending: false }).limit(400);
  const out = {};
  for (const r of data || []) {
    out[r.exercise_id] = out[r.exercise_id] || [];
    if (out[r.exercise_id][r.set_number - 1] === undefined) out[r.exercise_id][r.set_number - 1] = `${fmtKg(r.weight)}×${r.reps}`;
  }
  return out;
}

async function invokeFn(name, body) {
  const { data, error } = await requireClient().functions.invoke(name, { body });
  if (error) throw error;
  return data;
}

async function toBase64(input) {
  if (typeof input === 'string') return input.split(',').pop(); // data URL → base64
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',').pop());
    r.onerror = rej;
    r.readAsDataURL(input);
  });
}

/* ---------- Offline queue (IndexedDB) ---------------------- */
const OfflineQueue = {
  DB: 'gaspol', STORE: 'queue', _db: null, _wired: false,
  async _open() {
    if (this._db) return this._db;
    this._db = await new Promise((res, rej) => {
      const req = indexedDB.open(this.DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.STORE, { keyPath: 'qid', autoIncrement: true });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return this._db;
  },
  async enqueue(tableName, row) {
    const db = await this._open();
    return new Promise((res, rej) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      tx.objectStore(this.STORE).add({ table: tableName, row, ts: Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
  async flush() {
    if (!sb || !navigator.onLine) return;
    const db = await this._open();
    const items = await new Promise((res) => {
      const out = [];
      const cur = db.transaction(this.STORE).objectStore(this.STORE).openCursor();
      cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push({ ...c.value, qid: c.key }); c.continue(); } else res(out); };
      cur.onerror = () => res(out);
    });
    for (const it of items) {
      const { error } = await sb.from(it.table).insert(it.row);
      if (!error) await this._delete(it.qid); // keep on failure; retry next flush
    }
  },
  async _delete(qid) {
    const db = await this._open();
    return new Promise((res) => { const tx = db.transaction(this.STORE, 'readwrite'); tx.objectStore(this.STORE).delete(qid); tx.oncomplete = res; });
  },
  flushWhenOnline() {
    if (!this._wired) { this._wired = true; addEventListener('online', () => this.flush().catch(() => {})); }
    this.flush().catch(() => {});
  },
};

export { OfflineQueue };
export default GaspolData;
