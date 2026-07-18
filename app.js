/* ============================================================
   Gaspol — app logic
   Faithful implementation of Gaspol.dc.html (18 screens, F1–F10):
   dark, AI-first mobile coach. Vanilla JS state + render engine,
   installable offline PWA. Persona P1 "Munir" · Cut · Week 3.

   Loaded as a module: it imports the progression engine directly and
   lazy-loads the Supabase data layer only when window.GASPOL_CONFIG is
   present, so the seed-data demo runs with no backend.
   ============================================================ */
import { evaluateProgression } from './progression.js';
import Vision from './foodvision.js';

(() => {
  'use strict';

  /* ---------- Reference data --------------------------------- */
  const ALTS = [
    { name: 'Machine Chest Press', equip: 'Machine', cat: 'machine', match: 96, scheme: '4 × 8–10 @ 50 kg', weight: 50, best: true, note: 'Closest match to your bench strength curve.' },
    { name: 'Dumbbell Bench Press', equip: 'Dumbbells', cat: 'dumbbell', match: 92, scheme: '4 × 8–10 @ 28 kg', weight: 28, note: 'More stabiliser work — log per dumbbell.' },
    { name: 'Incline Machine Press', equip: 'Machine', cat: 'machine', match: 85, scheme: '4 × 8–10 @ 40 kg', weight: 40, note: 'Shifts load onto upper chest.' },
    { name: 'Weighted Push-Up', equip: 'Bodyweight', cat: 'body', match: 78, scheme: '4 × 12–15 reps', weight: 0, note: 'No kit needed — add a plate on your back.' },
  ];
  const TAG_COLOR = { machine: '#8f8bff', dumbbell: '#ff9f0a', body: '#30d158' };
  const FILTERS = [['all', 'All'], ['machine', 'Machine'], ['dumbbell', 'Dumbbell'], ['body', 'Bodyweight']];

  const GOALS = [
    ['cut', 'Cut', 'Lose fat, keep muscle. ~0.5 kg/week.'],
    ['recomp', 'Recomp', 'Hold weight, trade fat for muscle.'],
    ['bulk', 'Lean bulk', 'Build muscle with minimal fat gain.'],
  ];

  const PRESETS = {
    'Sarapan': { name: 'Sarapan · oat + telur', kcal: 440, protein: 32 },
    'Makan siang': { name: 'Makan siang · nasi + ayam', kcal: 620, protein: 34 },
    'Post-workout': { name: 'Post-workout · whey shake', kcal: 160, protein: 30 },
  };
  const PORTIONS = [
    { label: '½ plate', mult: 0.5 }, { label: 'small plate', mult: 0.75 },
    { label: '1 plate · warteg', mult: 1 }, { label: 'large plate', mult: 1.25 },
    { label: '1½ plate', mult: 1.5 },
  ];
  // 35-day weight trend seed (demo). Replaced by fit_body_metrics when the backend is on.
  const BODY_TREND = (() => {
    const a = []; let w = 75.6;
    for (let i = 0; i < 35; i++) { w -= 0.04 + (i % 5 === 0 ? 0.02 : 0); a.push(Math.round(w * 10) / 10); }
    a[a.length - 1] = 74.2; return a;
  })();
  // Weekly review seed (demo). Replaced by the latest fit_coach_notes row (F8).
  const SEED_REVIEW = {
    title: 'Strong week, Munir.',
    body: 'Adherence is carrying this cut — every session in, weight bang on trend. The one gap is protein: three days under 155 g. Fix that and next week is another clean progression. Keep going.',
    stats: { sessions: 6, sessionsTarget: 6, adherencePct: 100, volumePct: 8, proteinAvg: 149, proteinFloor: 155, weightChange: -1.1 },
    changes: [
      { kind: 'progression', label: 'Thursday bench → 64 kg (+2.5)', detail: 'Top sets cleared 8 reps two weeks running.' },
      { kind: 'calories', label: 'Calories → 2,100 (-50)', detail: 'Weight loss slowed to 0.4%/wk — nudging the deficit.' },
      { kind: 'reminder', label: 'Protein reminder at 15:00', detail: 'You landed under the floor 3 days this week.' },
    ],
  };
  const CHANGE_COLOR = { progression: 'var(--green)', calories: 'var(--orange)', reminder: '#64d2ff', swap: '#8f8bff' };

  /* ---------- Today's session (Push A) ----------------------- */
  function mkEx(name, isCompound, sets, repLow, repHigh, weight, increment, prev, rest, progressed) {
    return {
      id: null, name, isCompound, targetSets: sets, repLow, repHigh, weight, increment,
      rest: rest || 90, swappedFrom: null, progressed: !!progressed, applied: false,
      sets: Array.from({ length: sets }, (_, i) => ({ kg: weight, reps: repHigh, rpe: 0, prev: prev[i] || '—', done: false })),
    };
  }
  const SESSION_SEED = () => ({
    name: 'Push A',
    exercises: [
      mkEx('Bench Press', true, 4, 6, 8, 64, 2.5, ['62×8', '62×8', '62×7', '62×7'], 120, true),
      mkEx('Overhead Press', true, 4, 6, 8, 40, 2.5, ['40×7', '40×7', '38×8', '38×8'], 120),
      mkEx('Incline DB Press', false, 3, 8, 10, 26, 2, ['24×10', '24×10', '24×9'], 90),
      mkEx('Lateral Raise', false, 3, 12, 15, 10, 1, ['10×12', '10×12', '10×11'], 60),
      mkEx('Triceps Pushdown', false, 3, 10, 12, 25, 1, ['22.5×12', '22.5×12', '22.5×11'], 60),
      mkEx('Cable Fly', false, 3, 12, 15, 14, 1, ['12×15', '12×15', '12×14'], 60),
    ],
  });

  /* ---------- Body-composition intake (E2/E6) ---------------- */
  const IFIELDS = {
    core: [['weight', 'Berat · Weight', 'kg'], ['waist', 'Pinggang · Waist', 'cm'], ['bodyfat', 'Lemak · Body fat', '%'], ['lbm', 'Massa otot · LBM', 'kg']],
    upper: [['neck', 'Leher · Neck', 'cm'], ['shoulder', 'Bahu · Shldr', 'cm'], ['chest', 'Dada · Chest', 'cm'], ['bicepsL', 'Bisep L', 'cm'], ['bicepsR', 'Bisep R', 'cm'], ['forearmL', 'Lengan L', 'cm'], ['forearmR', 'Lengan R', 'cm'], ['abdomen', 'Abdomen', 'cm']],
    lower: [['hip', 'Pinggul · Hip', 'cm'], ['thighL', 'Paha L', 'cm'], ['thighR', 'Paha R', 'cm'], ['calfL', 'Betis L', 'cm'], ['calfR', 'Betis R', 'cm']],
  };
  const IFIELD_LABEL = Object.fromEntries([...IFIELDS.core, ...IFIELDS.upper, ...IFIELDS.lower].map(([k, l]) => [k, l]));
  const IUNIT = Object.fromEntries([...IFIELDS.core, ...IFIELDS.upper, ...IFIELDS.lower].map(([k, , u]) => [k, u]));
  // Munir's 7 May tape (PRD §E9) — the account opens pre-populated.
  const IVALS_SEED = { weight: 68.6, waist: 88, bodyfat: 13.4, lbm: 60.8, neck: 39, shoulder: 116, chest: 97, bicepsL: 35, bicepsR: 34, forearmL: 28, forearmR: 28, abdomen: 89.5, hip: 90.5, thighL: 51, thighR: 53, calfL: 24.5, calfR: 24.5 };

  const EXPERIENCE = [
    ['beginner', 'Pemula · Beginner', 'Baru mulai / &lt; 1 th — start conservative, fast progression.'],
    ['intermediate', 'Menengah · Intermediate', '1–3 th latihan — seed from your logged top sets.'],
    ['advanced', 'Mahir · Advanced', '3 th+ — smaller jumps, autoregulated by RPE.'],
  ];
  const CONSULT_CHIPS = [
    ['Latihan hari ini?', 'Latihan apa hari ini?'], ['Progresku?', 'Progresku minggu ini?'],
    ['Target makro?', 'Target makro hari ini?'], ['Beban berikut?', 'Beban sesi berikut?'],
    ['WHR vs target?', 'WHR vs target?'], ['Kapan stop kafein?', 'Kapan stop kafein?'],
  ];

  // Imported InBody segmental scan — 25 Apr FitScan (PRD E9), real fit_body_metrics.scan shape.
  const SCAN_SEED = {
    date: '25 Apr', bmi: 24.4, bmr: 1631, visceral: 5, bodyAge: 26, musclePct: 81.7, fatPct: 13.6, whr: 0.94,
    segments: {
      arm_l: { m: 3.3, f: 0.6 }, arm_r: { m: 3.4, f: 0.6 }, torso: { m: 26.2, f: 5.1 },
      leg_l: { m: 9.3, f: 1.6 }, leg_r: { m: 9.2, f: 1.6 },
    },
  };
  // 7-day check-in history (E8). Recent 2 days: poor sleep + high soreness → deload nudge.
  const CHECKIN_HISTORY = () => [
    { sleep: 7.4, energy: 4, soreness: 2 }, { sleep: 7.1, energy: 4, soreness: 2 },
    { sleep: 6.9, energy: 3, soreness: 3 }, { sleep: 7.2, energy: 4, soreness: 2 },
    { sleep: 7.0, energy: 3, soreness: 3 }, { sleep: 6.3, energy: 2, soreness: 4 },
    { sleep: 6.4, energy: 2, soreness: 4 },
  ];

  /* ---------- App state -------------------------------------- */
  const state = {
    tab: 'today',
    // auth gate (F10) — only engaged when config.requireAuth is true
    gate: null, authEmail: '', authSent: false, authBusy: false,
    // onboarding wizard (E2): program → experience → frequency → body-comp
    obStep: 0, obGoal: 'cut', obExp: 'intermediate', obFreq: 6,
    // body-composition intake (6a) — seeded with Munir's real tape
    iVals: { ...IVALS_SEED }, iEdit: null, iBuf: '', iUpperOpen: true, iLowerOpen: false, iGen: false, iReturn: 'today', plan: null,
    // workout — a full multi-exercise session
    session: SESSION_SEED(), exIdx: 0,
    rest: 0, restTotal: 90,
    bEdit: null, bBuf: '',        // Hevy-style editable cell (6b): {row, field}
    swapOpen: false, filter: 'all',
    report: null,                 // set on finish: { realization, changes, volume, sets }
    // consult chat (6c)
    qMsgs: [], qTyping: false, qInput: '',
    // nutrition
    kcalTarget: 2150, proteinTarget: 155,
    meals: [
      { name: 'Sarapan · oat + telur', sub: '07:20 · 32 g protein', kcal: 440, protein: 32 },
      { name: 'Makan siang · nasi + ayam', sub: '12:40 · 34 g protein', kcal: 620, protein: 34, ai: true },
      { name: 'Snack · Greek yogurt', sub: '15:30 · 22 g protein', kcal: 360, protein: 22 },
    ],
    portionIdx: 2,
    // on-device food-photo (F5): stage = capture | analyzing | result
    fp: { stage: 'capture', img: null, dish: null, kcalBase: 620, proteinBase: 34, conf: 0, matched: false, raw: [] },
    photoView: 'front', photoCompare: 50,
    body: { weightKg: 74.2, weekChange: -1.2, waist: 82, hip: 96, bf: 16, trend: BODY_TREND.slice() },
    scan: { ...SCAN_SEED },       // imported segmental scan (E6)
    review: null,                 // hydrated from the latest coach note; falls back to SEED_REVIEW
    profile: { name: 'Munir Sama', email: 'munir@email.com', joined: 'joined May 2026', premium: true },
    checkin: { sleep: 6.9, energy: 4, soreness: 4 },
    checkinHistory: CHECKIN_HISTORY(),   // 7-day recovery history (E8)
    reminders: {
      sessionStart: true, weighIn: true, weeklyReview: true,
      preworkout: true, caffeine: false, weeklyPhoto: true, streakRepair: false, whatsapp: false,
    },
  };
  const curEx = () => state.session.exercises[state.exIdx];
  const schemeOf = (ex) => `${ex.targetSets} × ${ex.repLow}–${ex.repHigh} @ ${fmtKg(ex.weight)} kg`;

  /* ---------- Backend (optional) ----------------------------- */
  const BE = { on: false, api: null };

  /* ---------- Helpers ---------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtKg = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const ICONS = {
    today: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="16" y1="3" x2="16" y2="6"/>',
    workout: '<rect x="2.5" y="9" width="3.5" height="6" rx="1.2"/><rect x="18" y="9" width="3.5" height="6" rx="1.2"/><line x1="6" y1="12" x2="18" y2="12"/>',
    food: '<circle cx="10.5" cy="12" r="7.5"/><line x1="20" y1="4" x2="20" y2="20"/>',
    body: '<circle cx="12" cy="7" r="3.2"/><rect x="7" y="12.5" width="10" height="8.5" rx="5"/>',
    review: '<polyline points="3,16 9,11 13,14 21,5"/><line x1="3" y1="20" x2="21" y2="20"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.6"/><line x1="8" y1="7" x2="9.5" y2="4.5"/><line x1="16" y1="7" x2="14.5" y2="4.5"/>',
  };
  const TAB_SCREENS = ['today', 'food', 'body', 'review'];
  const TABS = [['today', 'Today'], ['workout', 'Workout'], ['food', 'Food'], ['body', 'Body'], ['review', 'Progress']];
  const AB = '<div class="ai-badge">AI</div>';
  const HINT = (html) => `<div class="hint"><span class="b"></span><span>${html}</span></div>`;

  /** Weight-trend area chart from an array of kg values. */
  function trendSvg(trend) {
    const n = trend.length; if (n < 2) return '';
    const min = Math.min(...trend), max = Math.max(...trend), span = (max - min) || 1;
    const pts = trend.map((w, i) => `${((i / (n - 1)) * 320).toFixed(0)},${(14 + ((max - w) / span) * 58).toFixed(0)}`).join(' ');
    return `<svg width="100%" height="86" viewBox="0 0 320 86" preserveAspectRatio="none"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30d158" stop-opacity=".35"/><stop offset="1" stop-color="#30d158" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${pts} 320,86 0,86" fill="url(#wg)"/>
      <polyline points="${pts}" fill="none" stroke="#30d158" stroke-width="2.5"/></svg>`;
  }
  /** Map a fit_food_logs row → the meal shape the Food screen renders. */
  function mapFoodRow(m) {
    const t = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : nowTime();
    return {
      name: m.name, sub: `${t} · ${Math.round(Number(m.protein))} g protein`,
      kcal: Math.round(Number(m.kcal)), protein: Math.round(Number(m.protein)),
      ai: /photo|ai/i.test(m.meal || ''),
    };
  }

  /* =========================================================
     Today (1a)
     ========================================================= */
  function screenToday() {
    const kcal = sum(state.meals, 'kcal'), protein = sum(state.meals, 'protein');
    const kcalPct = Math.round(kcal / state.kcalTarget * 100), proteinPct = Math.round(protein / state.proteinTarget * 100);
    const kcalDeg = Math.min(360, kcal / state.kcalTarget * 360), proteinDeg = Math.min(360, protein / state.proteinTarget * 360);
    return `<div class="pad">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0 22px">
        <div><div class="h-day">Wed · 16 Jul</div><div class="h-greet">Good morning, Munir</div></div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="pill pill-phase">Cut · Wk 3</div>
          <button class="gear" data-action="nav-consult" aria-label="Consult coach"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"/></svg></button>
          <button class="gear" data-action="nav:settings" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.gear}</svg></button>
        </div>
      </div>
      <div class="coach" style="margin-bottom:16px">
        <div class="coach-head">${AB}<span class="coach-title">Coach</span><span class="dot-live"></span>
          <span style="font-size:11px;color:rgba(255,255,255,.5);margin-left:auto">Updated just now</span></div>
        <p>Bench cleared its top set two weeks running — I moved <b>Thursday to 64&nbsp;kg</b>. You're <b>1.2&nbsp;kg down</b> this week, right on trend. Hit your protein floor today: <b>155&nbsp;g</b>.</p>
        <div class="coach-link" data-action="nav-consult">Tanya coach · Ask your coach →</div>
      </div>
      ${recoveryStatus().deload ? recoveryCard() : ''}
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span class="section-label" style="margin:0">TODAY'S SESSION</span>
          <span style="font-size:11px;color:var(--muted-2)">Program · Week 3 of 4</span></div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-.4px">${esc(state.session.name)}</div>
        <div style="font-size:13px;color:var(--muted);margin:3px 0 14px">${state.session.exercises.length} exercises · ~52 min · Chest · Shoulders · Triceps</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">
          <span class="chip">Bench · 64 kg</span><span class="chip">OHP</span><span class="chip">Incline DB</span><span class="chip">+3 more</span></div>
        <button class="btn btn-primary" data-action="nav:workout">Start workout</button>
      </div>
      <div class="stat-row">
        <div class="ring-card"><h4>Calories</h4><div class="ring-wrap">
          <div class="ring" style="background:conic-gradient(var(--green) ${kcalDeg}deg,rgba(255,255,255,.08) ${kcalDeg}deg)"><span>${kcalPct}%</span></div>
          <div><div class="ring-val">${kcal.toLocaleString()}</div><div class="ring-sub">of ${state.kcalTarget.toLocaleString()}</div></div></div></div>
        <div class="ring-card"><h4>Protein</h4><div class="ring-wrap">
          <div class="ring" style="background:conic-gradient(var(--orange) ${proteinDeg}deg,rgba(255,255,255,.08) ${proteinDeg}deg)"><span>${proteinPct}%</span></div>
          <div><div class="ring-val">${protein}<span style="font-size:12px;color:var(--muted-2)">g</span></div><div class="ring-sub">of ${state.proteinTarget} g</div></div></div></div>
      </div>
      <div class="quick-row">
        <div class="quick" data-action="nav:body">Log weight</div>
        <div class="quick" data-action="nav:food">Log meal</div>
        <div class="quick" data-action="nav:checkin">Check-in</div>
      </div>
    </div>`;
  }

  /* =========================================================
     Workout (1c) + swap (2a) — F2
     ========================================================= */
  function screenWorkout() {
    const ex = curEx();
    const n = state.session.exercises.length;
    const be = state.bEdit;
    const activeIdx = ex.sets.findIndex((s) => !s.done);
    const rows = ex.sets.map((s, i) => {
      const isAct = i === activeIdx && !s.done;
      const dim = !s.done && !isAct;
      const kgEd = be && be.row === i && be.field === 'kg';
      const rpEd = be && be.row === i && be.field === 'reps';
      const numBg = s.done ? 'rgba(48,209,88,.14)' : isAct ? 'rgba(148,140,255,.2)' : '#1c1c1e';
      const numColor = s.done ? 'var(--green)' : isAct ? 'var(--indigo-2)' : 'var(--muted-2)';
      const kgShown = kgEd ? (state.bBuf !== '' ? state.bBuf : fmtKg(s.kg)) : fmtKg(s.kg);
      const repsShown = rpEd ? (state.bBuf !== '' ? state.bBuf : ((s.done || s.reps) ? s.reps : '—')) : ((s.done || s.reps) ? s.reps : '—');
      const rowStyle = `display:grid;grid-template-columns:34px 1fr 1fr 44px 36px;gap:8px;align-items:center;margin-bottom:8px;${isAct ? 'padding:7px 6px;margin-left:-6px;margin-right:-6px;background:rgba(94,92,230,.08);border:1px solid rgba(148,140,255,.35);border-radius:14px;' : ''}${dim ? 'opacity:.5;' : ''}`;
      return `<div style="${rowStyle}">
        <div style="width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;background:${numBg};color:${numColor}">${i + 1}</div>
        <div class="icell ${kgEd ? 'editing' : ''}"${kgEd ? ' id="editcell"' : ''} data-action="b-tap:${i}:kg">${kgShown}</div>
        <div class="icell ${rpEd ? 'editing' : ''} ${!(s.done || s.reps) ? 'empty' : ''}"${rpEd ? ' id="editcell"' : ''} data-action="b-tap:${i}:reps">${repsShown}</div>
        <div style="background:#161618;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 0;text-align:center;font-size:13px;font-weight:600;color:var(--muted-2)">${s.rpe || '—'}</div>
        <div data-action="log-set:${i}" style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;cursor:pointer;background:${s.done ? 'var(--green)' : isAct ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.06)'};color:${s.done ? 'var(--green-ink)' : 'var(--muted-2)'}">✓</div>
      </div>`;
    }).join('');
    const swapNote = ex.swappedFrom ? `<div class="swap-note"><span class="tick">✓</span>Swapped from ${esc(ex.swappedFrom)} · weight re-estimated by Coach</div>` : '';
    const sugg = (ex.progressed && !ex.swappedFrom) ? `<div style="display:flex;align-items:center;gap:9px;background:rgba(94,92,230,.12);border:1px solid rgba(148,140,255,.28);border-radius:12px;padding:10px 12px;margin-bottom:13px;${ex.applied ? 'opacity:.55' : ''}">
        <div style="width:26px;height:26px;border-radius:8px;background:rgba(148,140,255,.2);display:flex;align-items:center;justify-content:center;color:#b7b3ff;font-size:14px;font-weight:800">↑</div>
        <div style="flex:1;font-size:12px;color:#c7c5f5;line-height:1.4"><b style="color:var(--indigo-2)">Naikkan · Increase</b> — semua set kena top range minggu lalu. Coba ${fmtKg(ex.weight + ex.increment)} kg.</div>
        <button data-action="apply-progression" style="flex:none;background:var(--indigo);color:#fff;font-size:11.5px;font-weight:800;padding:7px 12px;border-radius:9px;cursor:pointer;border:none">${ex.applied ? '✓ ok' : '+' + fmtKg(ex.increment)}</button>
      </div>` : '';
    const lastRef = `<div style="background:#141416;border:1px solid rgba(255,255,255,.06);border-radius:13px;padding:12px 14px;margin-top:14px">
        <div style="font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--dim);margin-bottom:7px">SESI LALU · LAST TIME · 12 Jul</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${ex.sets.map((s) => `<span style="font-size:11.5px;color:var(--text-2);background:var(--surface);border-radius:7px;padding:4px 8px">${esc(s.prev)}</span>`).join('')}</div></div>`;
    const dots = state.session.exercises.map((e, idx) => {
      const cls = e.sets.every((s) => s.done) ? 'done' : (idx === state.exIdx ? 'cur' : '');
      return `<i class="${cls}"></i>`;
    }).join('');
    return `<div class="workout">
      <div class="sess-top">
        <button class="icon-btn" data-action="nav:today" aria-label="End workout">✕</button>
        <div class="sess-mid"><div class="sess-kicker">${esc(state.session.name.toUpperCase())} · ${state.exIdx + 1} / ${n}</div><div class="sess-name">${esc(ex.name)}</div></div>
        <div class="sess-elapsed" style="text-align:right"><div class="l">REST</div><div class="v" style="color:var(--green)">${state.rest > 0 ? fmt(state.rest) : 'Ready'}</div></div>
      </div>
      <div class="progress-dots">${dots}</div>
      <div class="workout-scroll"><div class="pad" style="padding-top:0">
        <div class="ex-head"><div class="ex-head-row">
          <div style="flex:1"><div class="ex-name">${esc(ex.name)}</div><div class="ex-scheme">Prescribed&nbsp;<b>${esc(schemeOf(ex))}</b></div></div>
          <button class="swap-btn" data-action="open-swap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="17,3 21,7 17,11"/><line x1="21" y1="7" x2="7" y2="7"/><polyline points="7,21 3,17 7,13"/><line x1="3" y1="17" x2="17" y2="17"/></svg>Swap</button>
        </div>${swapNote}</div>
        ${sugg}
        <div style="display:grid;grid-template-columns:34px 1fr 1fr 44px 36px;gap:8px;padding:0 4px 8px;font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--dim)"><div>SET</div><div style="text-align:center">KG</div><div style="text-align:center">REPS</div><div style="text-align:center">RPE</div><div></div></div>
        ${rows}
        <div style="display:flex;gap:9px;margin:12px 0 0">
          <div data-action="add-set" style="flex:1;background:var(--surface);color:var(--text);border:1px solid var(--line-strong);border-radius:12px;padding:11px;font-size:13.5px;font-weight:700;cursor:pointer;text-align:center">＋ Tambah set · Add</div>
          <div data-action="del-set" style="width:46px;display:flex;align-items:center;justify-content:center;background:rgba(255,69,58,.1);color:#ff453a;border:1px solid rgba(255,69,58,.25);border-radius:12px;font-size:16px;cursor:pointer">🗑</div>
        </div>
        ${lastRef}
        ${HINT("Ketuk <b>KG / REPS</b> untuk ubah · tap a cell to type your real numbers. Machine penuh? Tap <b>Swap</b>.")}
      </div></div>
      <div id="restRegion">${restRegion()}</div>
      ${be ? keypad('b', be.field === 'kg' ? 'Berat (kg) · Set ' + (be.row + 1) : 'Reps · Set ' + (be.row + 1)) : ''}
      ${state.swapOpen ? swapSheet() : ''}
    </div>`;
  }

  /** Shared numeric keypad sheet (intake + set editing). ctx = 'i' | 'b'. */
  function keypad(ctx, label) {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<'];
    return `<div class="keypad"><div class="kp-head"><span class="l">${esc(label)}</span><button class="kp-done" data-action="kp-done:${ctx}">Selesai · Done</button></div>
      <div class="kp-grid">${keys.map((k) => `<button class="kp-key" data-action="kp:${ctx}:${k === '<' ? 'bk' : k}">${k === '<' ? '⌫' : k}</button>`).join('')}</div></div>`;
  }

  function restRegion() {
    const ex = curEx();
    const last = state.exIdx === state.session.exercises.length - 1;
    if (ex.sets.every((s) => s.done)) {
      return `<div class="rest" style="background:#0d0d10">
        <button class="btn btn-primary" data-action="${last ? 'finish-session' : 'next-exercise'}">${last ? 'Finish session →' : 'Next exercise →'}</button></div>`;
    }
    if (state.rest > 0) {
      const pct = Math.round(state.rest / state.restTotal * 100);
      return `<div class="rest"><div class="rest-top"><span class="l">REST</span>
        <span class="t">${fmt(state.rest)}</span>
        <button class="rest-skip" data-action="skip-rest">Skip</button></div>
        <div class="rest-track"><div class="rest-fill" style="width:${pct}%"></div></div></div>`;
    }
    return `<div class="rest-idle"><span class="b"></span><span>Log each set — I start your rest timer automatically.</span></div>`;
  }

  function swapSheet() {
    const alts = state.filter === 'all' ? ALTS : ALTS.filter((a) => a.cat === state.filter);
    const cards = alts.map((a) => {
      const matchColor = a.match >= 90 ? 'var(--green)' : 'var(--muted)';
      const idx = ALTS.indexOf(a);
      return `<button class="alt ${a.best ? 'best' : ''}" data-action="choose-alt:${idx}">
        <div class="alt-top"><span class="alt-name">${esc(a.name)}</span>${a.best ? '<span class="badge-best">BEST MATCH</span>' : ''}
          <span class="alt-match" style="color:${matchColor}">${a.match}% match</span></div>
        <div class="alt-meta"><span class="alt-equip" style="color:${TAG_COLOR[a.cat]}">${esc(a.equip)}</span><span class="alt-scheme">${esc(a.scheme)}</span></div>
        <div class="alt-note">${esc(a.note)}</div></button>`;
    }).join('');
    const chips = FILTERS.map(([k, l]) => `<button class="fchip ${state.filter === k ? 'active' : ''}" data-action="filter:${k}">${l}</button>`).join('');
    return `<div class="sheet-scrim"><div class="sheet-bg" data-action="close-swap"></div>
      <div class="sheet"><div class="sheet-grab"></div>
        <div class="sheet-title-row"><div class="sheet-title">Swap exercise</div><button class="sheet-cancel" data-action="close-swap">Cancel</button></div>
        <div class="sheet-sub">Same muscle group · chest, front delts, triceps</div>
        <div class="sheet-ai">${AB}<span>Bench bay busy? Here's what hits the same muscles with what's free — ranked for you.</span></div>
        <div class="chips">${chips}</div>
        <div class="alts">${cards || '<div class="alt-note" style="padding:8px 2px">No alternatives for this filter.</div>'}</div>
      </div></div>`;
  }

  /* =========================================================
     Session report (4a) — computed from the logged session + F3
     ========================================================= */
  function screenReport() {
    const r = state.report || { realization: [], changes: [], volume: 0, sets: 0 };
    const rowsHtml = r.realization.map((x) => `<div class="srow"><div><div class="n">${esc(x.name)}</div>
      <div class="sub">${esc(x.prescribed)} → <b style="color:var(--text-2)">${esc(x.performed)}</b></div></div>
      <span style="font-size:11px;font-weight:700;color:${x.color};background:${x.bg};padding:5px 9px;border-radius:999px">${x.tag}</span></div>`).join('');

    const changesHtml = r.changes.length
      ? `<div class="section-label">COACH ADJUSTMENTS · next session</div>
         <div class="group">${r.changes.map((c) => `<div class="srow"><div><div class="n">${esc(c.name)} → ${fmtKg(c.to)} kg <span style="color:${c.delta >= 0 ? 'var(--green)' : 'var(--orange)'};font-weight:600">(${c.delta >= 0 ? '+' : ''}${fmtKg(c.delta)})</span></div><div class="sub">${esc(c.reason)}</div></div></div>`).join('')}</div>
         <button class="btn btn-ghost" data-action="undo-progression" style="margin-bottom:16px">${r.undone ? 'Adjustments reverted' : 'Undo adjustments'}</button>`
      : '';

    const exceeded = r.realization.filter((x) => x.tag.startsWith('Exceeded')).length;
    return `<div class="route">
      <div class="topbar"><span style="width:34px"></span><span class="grow" style="text-align:center;font-size:16px;font-weight:700">Session complete</span>
        <button class="sheet-cancel" data-action="finish-report" style="width:auto">Done</button></div>
      <div class="view" style="overflow-y:auto"><div class="pad" style="padding-top:8px">
        <div style="text-align:center;padding:14px 0 18px">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(48,209,88,.15);border:1.5px solid rgba(48,209,88,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;color:var(--green);font-weight:800">✓</div>
          <div style="font-size:24px;font-weight:700;letter-spacing:-.4px">${esc(state.session.name)} · done</div>
          <div style="font-size:13px;color:var(--muted-2);margin-top:3px">${r.sets} sets · ${r.volume.toLocaleString()} kg total volume</div></div>
        <div style="display:flex;gap:10px;margin-bottom:18px">
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--green)">+8%</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">volume vs last</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800">${exceeded} ↑</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">exceeded target</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--orange)">12</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">day streak</div></div></div>
        <div class="section-label">PRESCRIBED vs PERFORMED</div>
        <div class="group">${rowsHtml || '<div class="srow"><div class="sub">No sets logged.</div></div>'}</div>
        ${changesHtml}
        <div class="coach"><div class="coach-head">${AB}<span class="coach-title">Coach note</span></div>
          <p>${esc(r.note || 'Solid session logged. Keep the top sets honest and progression takes care of itself.')}</p></div>
      </div></div></div>`;
  }

  /* =========================================================
     Food day log (3b) + AI photo (3a) — F5
     ========================================================= */
  function screenFood() {
    const kcal = sum(state.meals, 'kcal'), protein = sum(state.meals, 'protein');
    const kcalPct = Math.min(100, Math.round(kcal / state.kcalTarget * 100));
    const proPct = Math.min(100, Math.round(protein / state.proteinTarget * 100));
    const logged = state.meals.map((m) => `<div class="srow"><div><div class="n">${esc(m.name)}</div>
      <div class="sub">${esc(m.sub)}${m.ai ? ' · <span style="color:var(--indigo-3)">AI photo</span>' : ''}</div></div>
      <span style="font-size:14px;font-weight:600;color:var(--text-2)">${m.kcal}</span></div>`).join('');
    const presets = Object.keys(PRESETS).map((k) => `<button class="fchip" data-action="add-preset:${esc(k)}" style="border-radius:999px">+ ${esc(k)}</button>`).join('');
    return `<div class="route">
      <div class="pad" style="padding-bottom:150px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 18px">
          <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">Food</div><span style="font-size:13px;color:var(--muted-2)">Today · Wed</span></div>
        <div class="card" style="margin-bottom:16px">
          <div class="macro-top"><span class="macro-name">Calories</span><span class="macro-val"><b style="color:var(--text);font-size:16px">${kcal.toLocaleString()}</b> / ${state.kcalTarget.toLocaleString()}</span></div>
          <div class="macro-track" style="height:10px;margin-bottom:16px"><div class="macro-fill" style="width:${kcalPct}%;background:var(--green)"></div></div>
          <div class="macro-top"><span class="macro-name">Protein <span style="color:var(--orange)">· floor ${state.proteinTarget} g</span></span><span class="macro-val"><b style="color:var(--orange);font-size:16px">${protein}</b> / ${state.proteinTarget} g</span></div>
          <div class="macro-track" style="height:10px"><div class="macro-fill" style="width:${proPct}%;background:var(--orange)"></div></div>
        </div>
        <div class="section-label">QUICK ADD</div>
        <div class="chips" style="margin-bottom:18px">${presets}</div>
        <div class="section-label">LOGGED TODAY</div>
        <div class="group" style="margin-bottom:0">${logged}</div>
        ${HINT('Snap a photo and Coach estimates the dish, portion &amp; protein with a range you confirm — <b>estimates stay labelled as estimates.</b>')}
      </div>
      <button class="fab" data-action="nav:foodphoto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${ICONS.camera}</svg>Snap a meal</button>
    </div>`;
  }

  function screenFoodphoto() {
    const fp = state.fp;
    const fileInput = `<input type="file" accept="image/*" capture="environment" id="foodfile" style="display:none">`;
    const top = `<div class="topbar"><button class="sheet-cancel" data-action="nav:food" style="width:auto;color:var(--text-2)">Cancel</button>
        <span class="grow" style="text-align:center;font-size:16px;font-weight:700">On-device estimate</span>
        <button class="sheet-cancel" data-action="${fp.stage === 'capture' ? 'nav:food' : 'fp-retake'}" style="width:auto;color:var(--indigo-3)">${fp.stage === 'capture' ? '' : 'Retake'}</button></div>`;

    // --- Stage 1: capture -------------------------------------------------
    if (fp.stage === 'capture') {
      return `<div class="route">${top}
        <div class="view" style="overflow-y:auto"><div style="padding:20px">
          <button data-action="fp-shoot" class="fp-photo" style="width:100%;border:1.5px dashed var(--line-strong);cursor:pointer;flex-direction:column;gap:12px">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--indigo-3)" stroke-width="1.8">${ICONS.camera}</svg>
            <span style="font-size:15px;font-weight:700;color:var(--text)">Foto makananmu · Snap your meal</span>
            <span style="font-size:12px;color:var(--muted-2)">Kamera atau galeri · camera or gallery</span></button>
          ${HINT('Fotonya diproses <b style="color:var(--text-2)">di HP kamu</b> — tanpa server, tanpa API key, tetap jalan offline. · Runs on your phone, no server.')}
          <button class="btn btn-ghost" data-action="fp-pick" style="margin-top:10px">Pilih dari daftar · Pick from library</button>
        </div></div>${fileInput}</div>`;
    }

    // --- Stage 2/3: analyzing / result -----------------------------------
    const p = PORTIONS[state.portionIdx];
    const kcal = Math.round(fp.kcalBase * p.mult / 10) * 10;
    const protein = Math.round(fp.proteinBase * p.mult);
    const kLo = Math.round(kcal * 0.85 / 10) * 10, kHi = Math.round(kcal * 1.15 / 10) * 10;
    const pLo = Math.round(protein * 0.85), pHi = Math.round(protein * 1.15);
    const analyzing = fp.stage === 'analyzing';
    const good = fp.matched && fp.conf >= 55;
    const badge = analyzing
      ? `<div style="display:flex;align-items:center;gap:7px;background:rgba(10,10,11,.72);backdrop-filter:blur(10px);border:1px solid rgba(148,140,255,.4);border-radius:999px;padding:6px 11px"><div class="ai-badge" style="width:18px;height:18px;font-size:8px">AI</div><span style="font-size:12px;font-weight:600;color:#d8d6ff">Menganalisis… · analyzing</span></div>`
      : `<div style="display:flex;align-items:center;gap:7px;background:rgba(10,10,11,.72);backdrop-filter:blur(10px);border:1px solid ${good ? 'rgba(48,209,88,.4)' : 'rgba(255,159,10,.4)'};border-radius:999px;padding:6px 11px"><div class="ai-badge" style="width:18px;height:18px;font-size:8px">AI</div><span style="font-size:12px;font-weight:600;color:${good ? '#7ee59b' : '#ffcf7a'}">${good ? `Detected · ${fp.conf}%` : `Not sure${fp.conf ? ` · ${fp.conf}%` : ''}`}</span></div>`;

    const body = analyzing
      ? `<div style="padding:26px 20px;text-align:center;color:var(--muted)"><div style="font-size:14px;font-weight:600">Menganalisis di HP kamu…</div><div style="font-size:12px;color:var(--muted-2);margin-top:6px">Model dimuat sekali, lalu jalan offline. · First run loads the model, then it's offline.</div></div>`
      : `<div style="padding:18px 20px 28px">
          <div class="section-label" style="margin-bottom:6px">${good ? 'I THINK THIS IS' : 'BEST GUESS — CHECK IT'}</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:-.3px">${esc(fp.dish || 'Mixed meal')}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:12px">
            <span style="font-size:13px;color:var(--muted)">Portion</span>
            <div class="stepper"><button data-action="portion:-1">−</button><span style="font-size:14px;font-weight:600;min-width:104px;text-align:center">${esc(p.label)}</span><button data-action="portion:1">+</button></div></div>
          <div style="display:flex;gap:12px;margin:18px 0 6px">
            <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Calories</div><div style="font-size:26px;font-weight:800;margin-top:5px">≈ ${kcal}</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">range ${kLo}–${kHi} kcal</div></div>
            <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Protein</div><div style="font-size:26px;font-weight:800;margin-top:5px;color:var(--orange)">≈ ${protein}<span style="font-size:15px;color:var(--muted-2)">g</span></div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">range ${pLo}–${pHi} g</div></div></div>
          ${HINT(good
            ? 'These are <b style="color:var(--text-2)">estimates, not exact</b> — tap ± to correct the portion.'
            : 'The model wasn&rsquo;t confident (Indonesian dishes are hard on-device). <b style="color:var(--text-2)">Adjust the portion</b> or pick from your library.')}
          <button class="btn btn-primary" data-action="log-photo" style="margin:8px 0 10px">Looks right — log it</button>
          <button class="btn btn-ghost" data-action="fp-pick">Pick from library instead</button>
        </div>`;

    return `<div class="route">${top}
      <div class="view" style="overflow-y:auto">
        <div class="fp-photo" style="background:#0b0b0d">
          <img src="${fp.img}" alt="meal" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
          <div style="position:absolute;top:14px;left:16px">${badge}</div>
        </div>
        ${body}
      </div></div>`;
  }

  /* =========================================================
     Body (4b) + progress-photo compare (4c) — F6
     ========================================================= */
  function screenBody() {
    const b = state.body;
    const whr = (b.waist / b.hip).toFixed(2);
    const wcColor = b.weekChange <= 0 ? 'var(--green)' : 'var(--orange)';
    const wcStr = `${b.weekChange <= 0 ? '−' : '+'}${Math.abs(b.weekChange).toFixed(1)} kg`;
    return `<div class="route">
      <div class="pad">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 18px">
          <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">Body</div><span style="font-size:13px;color:var(--muted-2)">Wed · 16 Jul</span></div>
        <div class="card" style="border-radius:20px;margin-bottom:14px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
            <div><div style="font-size:12px;color:var(--muted-2);font-weight:600">Weight · today</div><div style="font-size:34px;font-weight:800;letter-spacing:-1px;margin-top:2px">${fmtKg(b.weightKg)}<span style="font-size:16px;color:var(--muted-2)">kg</span></div></div>
            <div style="text-align:right"><div style="font-size:15px;font-weight:700;color:${wcColor}">${wcStr}</div><div style="font-size:11px;color:var(--muted-2)">this week</div></div></div>
          ${trendSvg(b.trend)}
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-top:6px"><span>${b.trend.length} days ago</span><span>today</span></div>
        </div>
        ${scanCard()}
        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Waist / Hip</div><div style="font-size:20px;font-weight:800;margin-top:5px">${fmtKg(b.waist)} / ${fmtKg(b.hip)}</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">WHR <b style="color:var(--text-2)">${whr}</b></div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Body fat</div><div style="font-size:20px;font-weight:800;margin-top:5px">≈ ${fmtKg(b.bf)}<span style="font-size:13px;color:var(--muted-2)">%</span></div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">scale estimate</div></div></div>
        ${bodyRecommendations()}
        <button class="btn btn-primary" data-action="log-weight" style="margin-bottom:10px">Log today's weigh-in · Timbang</button>
        <button class="btn btn-ghost" data-action="nav-measure" style="margin-bottom:10px">Ukur tubuh lengkap · Full measurements</button>
        <button class="btn btn-ghost" data-action="nav:photos">Compare progress photos</button>
      </div></div>`;
  }
  /** Rule-based body recommendations (E6/US6.3) from the latest measurements. */
  function bodyRecommendations() {
    const v = state.iVals;
    const recs = [];
    const whr = (v.waist && v.hip) ? v.waist / v.hip : null;
    if (whr && whr >= 0.9) recs.push(['#ff9f0a', `WHR ${whr.toFixed(2)} vs target &lt;0.90`, 'Tahan cut & tambah kerja core/oblique. · Hold the cut, train core.']);
    if (v.bicepsL != null && v.bicepsR != null && Math.abs(v.bicepsL - v.bicepsR) >= 1) {
      const strong = v.bicepsL > v.bicepsR ? 'kiri' : 'kanan';
      recs.push(['#5e5ce6', `Bisep ${fmtKg(v.bicepsL)} vs ${fmtKg(v.bicepsR)} cm`, `Sisi ${strong} lebih besar — tambah kerja unilateral. · Add single-arm work.`]);
    }
    if (v.bodyfat != null && v.bodyfat <= 14) recs.push(['#30d158', `Body fat ${v.bodyfat}%`, 'Mendekati target lean — siap transisi ke maintenance ~1 minggu lagi. · Near your target.']);
    if (!recs.length) recs.push(['#8e8e93', 'Belum cukup data', 'Isi ukuran tubuh untuk rekomendasi. · Log measurements for advice.']);
    return `<div style="margin-bottom:16px">
      <div class="section-label">REKOMENDASI · RECOMMENDATIONS</div>
      ${recs.map(([c, t, d]) => `<div style="display:flex;gap:11px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;margin-bottom:8px">
        <div style="flex:none;width:8px;height:8px;border-radius:2px;background:${c};margin-top:5px"></div>
        <div><div style="font-size:13px;font-weight:700">${t}</div><div style="font-size:12px;color:var(--muted);margin-top:2px">${d}</div></div></div>`).join('')}
    </div>`;
  }

  /* Imported segmental scan display (E6/US6.2). */
  function scanCard() {
    const sc = state.scan; const seg = sc.segments;
    const maxM = Math.max(...Object.values(seg).map((s) => s.m));
    const segRow = (name, L, Rr) => {
      const cells = [L, Rr].filter(Boolean).map((s, i) => {
        const w = Math.round(s.m / maxM * 100);
        const side = Rr ? (i === 0 ? 'L · ' : 'R · ') : '';
        return `<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--muted-2)">${side}${name}</span><span style="font-weight:700">${fmtKg(s.m)}<span style="color:var(--muted-2);font-size:9px"> kg</span></span></div>
          <div style="height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden"><div style="height:100%;width:${w}%;background:linear-gradient(90deg,#30d158,#8f8bff)"></div></div>
          <div style="font-size:9.5px;color:var(--dim);margin-top:2px">fat ${fmtKg(s.f)} kg</div></div>`;
      }).join('');
      return `<div style="display:flex;gap:14px;margin-bottom:12px">${cells}</div>`;
    };
    const mini = (k, val, u) => `<div style="flex:1"><div style="font-size:10px;color:var(--muted-2);font-weight:600">${k}</div><div style="font-size:16px;font-weight:800;margin-top:2px">${val}<span style="font-size:10px;color:var(--muted-2)">${u || ''}</span></div></div>`;
    return `<div class="card" style="border-radius:20px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Segmental scan · InBody ${sc.date}</div><span style="font-size:10px;font-weight:700;color:var(--indigo-3);background:rgba(94,92,230,.16);border:1px solid rgba(94,92,230,.3);padding:3px 8px;border-radius:999px">Body age ${sc.bodyAge}</span></div>
      <div style="display:flex;gap:10px;margin-bottom:16px">${mini('BMI', sc.bmi)}${mini('BMR', sc.bmr, ' kcal')}${mini('Visceral', sc.visceral)}${mini('Otot · Muscle', sc.musclePct, '%')}</div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.5px;color:var(--dim);margin-bottom:10px">OTOT PER BAGIAN · MUSCLE BY SEGMENT</div>
      ${segRow('Lengan · Arm', seg.arm_l, seg.arm_r)}
      ${segRow('Kaki · Leg', seg.leg_l, seg.leg_r)}
      ${segRow('Torso', seg.torso, null)}
    </div>`;
  }

  /* Recovery from sleep + soreness history (E8). */
  function recoveryStatus() {
    const h = state.checkinHistory || [];
    const last7 = h.slice(-7);
    const avgSleep = last7.length ? last7.reduce((a, x) => a + x.sleep, 0) / last7.length : 0;
    const poor = h.slice(-2).filter((x) => x.sleep < 7 && x.soreness >= 4).length;
    return { avgSleep: Math.round(avgSleep * 10) / 10, deload: poor >= 2, poor, last7 };
  }
  function sleepSpark(days) {
    return `<div style="display:flex;align-items:flex-end;gap:6px;height:64px">${days.map((d) => {
      const h = Math.max(8, Math.min(64, (d.sleep - 3.5) / 5 * 64));
      const c = d.sleep >= 7 ? 'var(--green)' : 'var(--orange)';
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;height:${Math.round(h)}px;border-radius:5px 5px 3px 3px;background:${c};opacity:.9"></div><span style="font-size:9px;color:var(--dim)">${d.sleep.toFixed(1)}</span></div>`;
    }).join('')}</div>`;
  }
  function recoveryCard() {
    const r = recoveryStatus();
    if (r.deload) return `<div style="display:flex;align-items:flex-start;gap:11px;background:rgba(255,159,10,.1);border:1px solid rgba(255,159,10,.3);border-radius:16px;padding:13px;margin-bottom:14px">
        <div style="flex:none;width:26px;height:26px;border-radius:8px;background:rgba(255,159,10,.2);display:flex;align-items:center;justify-content:center;color:var(--orange);font-size:14px;font-weight:800">!</div>
        <div><div style="font-size:13px;font-weight:700;color:#ffcf7a">Recovery rendah · pull back</div><div style="font-size:12px;color:var(--muted);margin-top:2px;line-height:1.4">Tidur ${r.avgSleep} jam &amp; soreness tinggi 2 hari — Coach kurangi volume Kamis ~20%. · Reduce Thursday's volume.</div></div></div>`;
    return `<div style="display:flex;align-items:center;gap:11px;background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.25);border-radius:16px;padding:13px;margin-bottom:14px">
        <div style="flex:none;width:26px;height:26px;border-radius:8px;background:rgba(48,209,88,.2);display:flex;align-items:center;justify-content:center;color:var(--green);font-size:14px;font-weight:800">✓</div>
        <div><div style="font-size:13px;font-weight:700;color:#7ee59b">Recovery oke · good to go</div><div style="font-size:12px;color:var(--muted);margin-top:2px">Tidur ${r.avgSleep} jam rata-rata — lanjut sesuai rencana. · On plan.</div></div></div>`;
  }

  function screenPhotos() {
    const v = state.photoCompare;
    const seg = [['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(([k, l]) => {
      const on = state.photoView === k;
      return `<button data-action="photoview:${k}" style="font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;cursor:pointer;${on ? 'color:#0c0c0e;background:var(--text);border:1px solid var(--text)' : 'color:var(--text-2);background:var(--surface);border:1px solid var(--line-strong)'}">${l}</button>`;
    }).join('');
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:body">‹</button><span class="grow t" style="text-align:center">Compare · ${state.photoView[0].toUpperCase() + state.photoView.slice(1)}</span>
        <div style="display:flex;align-items:center;gap:5px;color:var(--muted-2);font-size:12px;width:70px;justify-content:flex-end"><span style="width:13px;height:13px;border:1.4px solid var(--muted-2);border-radius:3px;display:inline-block"></span>Private</div></div>
      <div class="pad" style="padding-top:0">
        <div class="compare" id="cmp-wrap">
          <div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,#202024,#202024 13px,#191919 13px,#191919 26px)"><span style="position:absolute;bottom:16px;right:18px;font:11px ui-monospace,Menlo,monospace;color:var(--muted-2);letter-spacing:1px">[ week 3 ]</span></div>
          <div id="cmp-top" style="position:absolute;top:0;bottom:0;left:0;width:${v}%;overflow:hidden;background:repeating-linear-gradient(45deg,#19191b,#19191b 13px,#141416 13px,#141416 26px)"><div style="position:absolute;bottom:16px;left:18px;white-space:nowrap;font:11px ui-monospace,Menlo,monospace;color:var(--dim);letter-spacing:1px">[ week 1 ]</div></div>
          <div id="cmp-line" style="position:absolute;top:0;bottom:0;left:${v}%;transform:translateX(-50%);width:3px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.3);pointer-events:none"></div>
          <div id="cmp-knob" style="position:absolute;top:50%;left:${v}%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;color:#0c0c0e;font-size:16px;font-weight:800;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none">↔</div>
          <div style="position:absolute;top:12px;left:12px;background:rgba(10,10,11,.72);backdrop-filter:blur(8px);color:var(--text-2);font-size:11px;font-weight:600;padding:5px 10px;border-radius:999px;pointer-events:none">28 Jun</div>
          <div style="position:absolute;top:12px;right:12px;background:rgba(10,10,11,.72);backdrop-filter:blur(8px);color:#fff;font-size:11px;font-weight:600;padding:5px 10px;border-radius:999px;pointer-events:none">Today</div>
          <input type="range" min="0" max="100" value="${v}" id="cmp" aria-label="Compare slider">
        </div>
        <div style="display:flex;gap:10px;margin:16px 0 14px">${seg}</div>
        <div style="display:flex;align-items:center;gap:10px;background:#151517;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:13px;margin-bottom:16px"><span style="font-size:13px;color:var(--muted);line-height:1.4">Drag the handle to compare. Photos are <b style="color:var(--text-2)">encrypted &amp; private</b> — only you ever see them.</span></div>
        <button class="btn btn-primary" data-action="toast:This week's photo saved — private &amp; encrypted" style="display:flex;align-items:center;justify-content:center;gap:9px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">${ICONS.camera}</svg>Take this week's photo</button>
      </div></div>`;
  }

  /* =========================================================
     Daily check-in (4d) — F7
     ========================================================= */
  function rating(kind, val, activeBg, activeInk) {
    return `<div class="rate">${[1, 2, 3, 4, 5].map((n) => {
      const on = n === val;
      return `<button data-action="rate:${kind}:${n}" style="${on ? `background:${activeBg};border:none;color:${activeInk};font-weight:800` : ''}">${n}</button>`;
    }).join('')}</div>`;
  }
  function screenCheckin() {
    const ci = state.checkin;
    const sleepPct = Math.round(ci.sleep / 10 * 100);
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:today">✕</button><span class="grow t" style="text-align:center">Morning check-in</span><span style="width:34px"></span></div>
      <div class="workout-scroll" style="flex:1;overflow-y:auto"><div style="display:flex;flex-direction:column;padding:8px 24px 22px">
        <div style="font-size:13px;color:var(--muted-2);margin-bottom:18px">Ten seconds. It tunes today's plan.</div>
        ${recoveryCard()}
        <div style="margin-bottom:22px"><div style="font-size:12px;font-weight:700;color:var(--muted-2);letter-spacing:.3px;margin-bottom:10px">TIDUR 7 HARI · SLEEP · LAST 7 DAYS</div>${sleepSpark(recoveryStatus().last7)}</div>
        <div style="margin-bottom:26px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><span style="font-size:16px;font-weight:600">Sleep</span><span style="font-size:20px;font-weight:800">${ci.sleep.toFixed(1)}<span style="font-size:13px;color:var(--muted-2)">h</span></span></div>
          <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.08);position:relative"><div style="width:${sleepPct}%;height:100%;border-radius:999px;background:var(--indigo)"></div><div style="position:absolute;top:50%;left:${sleepPct}%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div></div></div>
        <div style="margin-bottom:24px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Energy</div>${rating('energy', ci.energy, 'var(--green)', 'var(--green-ink)')}</div>
        <div style="margin-bottom:24px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Soreness</div>${rating('soreness', ci.soreness, 'var(--orange)', '#2a1800')}</div>
        ${HINT(`Soreness at ${ci.soreness} ${ci.soreness >= 4 ? 'two days running — I may pull back Thursday&rsquo;s volume.' : '— recovery looks fine for Thursday.'}`)}
        <div style="height:14px"></div>
        <button class="btn btn-primary" data-action="save-checkin" style="padding:17px">Save check-in</button>
      </div></div></div>`;
  }

  /* =========================================================
     Reminders (5a) + Settings (5b) — F9/F10
     ========================================================= */
  function tgl(on, action) { return `<button class="tgl ${on ? 'on' : 'off'}" data-action="${action}" aria-pressed="${on}"><i></i></button>`; }
  function remRow(key, name, sub, last) {
    return `<div class="srow"${last ? ' style="border-bottom:none"' : ''}><div><div class="n">${name}</div><div class="sub">${sub}</div></div>${tgl(state.reminders[key], 'toggle:' + key)}</div>`;
  }
  function screenReminders() {
    const r = state.reminders;
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:settings">‹</button><span class="t">Reminders</span></div>
      <div class="pad" style="padding-top:0">
        <div class="section-label">THE ESSENTIALS</div>
        <div class="group">
          ${remRow('sessionStart', 'Session start', 'Weekdays · 18:00')}
          ${remRow('weighIn', 'Daily weigh-in', 'Every morning · 07:00')}
          ${remRow('weeklyReview', 'Weekly review ready', 'Sundays · 19:00', true)}
        </div>
        <div class="section-label">COACH NUDGES · <span style="color:var(--dim)">quiet by default</span></div>
        <div class="group">
          ${remRow('preworkout', 'Pre-workout meal', '90 min before your session')}
          ${remRow('caffeine', 'Caffeine cut-off', 'Adapts to training time · 14:00')}
          ${remRow('weeklyPhoto', 'Weekly photo', 'Sundays · 08:00')}
          ${remRow('streakRepair', 'Streak repair', "Only when you're about to slip", true)}
        </div>
        <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(150deg,#2a5a3a,#1a3a28);border:1px solid rgba(48,209,88,.3);border-radius:16px;padding:15px">
          <div style="flex:1"><div style="display:flex;align-items:center;gap:7px"><span style="font-size:14px;font-weight:700;color:#fff">WhatsApp reminders</span><span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:var(--green-ink);background:var(--green);padding:3px 6px;border-radius:5px">PREMIUM</span></div><div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:3px">Get nudges where you already are.</div></div>
          ${tgl(r.whatsapp, 'toggle:whatsapp')}
        </div>
      </div></div>`;
  }
  /* =========================================================
     Auth gate (F10) — shown only when config.requireAuth is true
     and there is no signed-in session yet.
     ========================================================= */
  function screenAuth() {
    const busy = state.authBusy, sent = state.authSent, offline = !BE.on;
    const gLogo = `<svg width="19" height="19" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>`;
    return `<div class="route" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh;padding:34px 26px">
      <div style="text-align:center;margin-bottom:36px">
        <div style="width:64px;height:64px;border-radius:20px;background:linear-gradient(135deg,var(--green),#1f9d57);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:30px;font-weight:900;color:#0c0c0e">G</div>
        <h1 style="font-size:26px;font-weight:800;margin-bottom:8px">Masuk ke Gaspol</h1>
        <p style="font-size:14px;color:var(--muted);line-height:1.5">Sign in to sync your training, meals &amp; progress across devices.</p>
      </div>
      ${offline ? `<div style="background:rgba(255,159,10,.1);border:1px solid rgba(255,159,10,.3);border-radius:14px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#ffcf7a;line-height:1.4">Server tak terjangkau — cek koneksi lalu coba lagi. · Server unreachable, check your connection.</div>` : ''}
      <button class="btn btn-primary" data-action="auth-google" style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px"${busy ? ' disabled' : ''}>${gLogo} Continue with Google</button>
      <div style="display:flex;align-items:center;gap:12px;margin:6px 0 14px;color:var(--dim);font-size:12px"><div style="flex:1;height:1px;background:var(--line)"></div>atau · or<div style="flex:1;height:1px;background:var(--line)"></div></div>
      ${sent
        ? `<div style="background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.25);border-radius:14px;padding:14px;font-size:13px;color:#7ee59b;line-height:1.5">Cek email kamu — magic link terkirim ke <b>${esc(state.authEmail)}</b>. Buka link itu untuk masuk. · Check your inbox for the sign-in link.</div>`
        : `<div class="qinput-wrap" style="margin-bottom:12px"><input id="authemail" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com · your email" value="${esc(state.authEmail)}"></div>
           <button class="btn btn-ghost" data-action="auth-magic"${busy ? ' disabled' : ''}>${busy ? 'Mengirim… · Sending…' : 'Email me a magic link'}</button>`}
      <p style="text-align:center;font-size:11px;color:var(--dim);margin-top:24px;line-height:1.5">Data kamu disimpan aman &amp; tidak pernah dijual. · Stored securely, never sold.</p>
    </div>`;
  }

  function screenSettings() {
    const pr = state.profile;
    const initial = (pr.name || '?').trim().charAt(0).toUpperCase();
    const premiumCard = pr.premium
      ? `<div class="coach" style="margin-bottom:18px;padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:15px;font-weight:700;color:#fff">Gaspol Premium</span><span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:#fff;background:rgba(255,255,255,.2);padding:3px 7px;border-radius:5px">ACTIVE</span></div>
          <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.45;margin-bottom:12px">Auto-progression, weekly AI review, food-photo AI, progress photos &amp; full history.</div>
          <div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:22px;font-weight:800;color:#fff">Rp 39k</span><span style="font-size:13px;color:rgba(255,255,255,.6)">/ month · renews 1 Aug</span></div></div>`
      : `<div class="coach" style="margin-bottom:18px;padding:16px">
          <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:6px">Gaspol Premium</div>
          <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.45;margin-bottom:12px">Unlock auto-progression, the weekly AI review, food-photo AI &amp; progress photos.</div>
          <button class="btn btn-primary" data-action="toast:Upgrade — Rp 39k / month" style="padding:12px">Upgrade · Rp 39k / mo</button></div>`;
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:today">‹</button><span class="t">Settings</span></div>
      <div class="pad" style="padding-top:0">
        <div class="srow" data-action="toast:Profile · coming soon" style="background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px;cursor:pointer">
          <div style="display:flex;align-items:center;gap:14px"><div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#3a3a3c,#2a2a2c);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">${esc(initial)}</div>
            <div><div style="font-size:17px;font-weight:700">${esc(pr.name || 'Your account')}</div><div class="sub">${esc([pr.email, pr.joined].filter(Boolean).join(' · '))}</div></div></div><span style="color:var(--dim);font-size:20px">›</span></div>
        ${premiumCard}
        <div class="section-label">PREFERENCES</div>
        <div class="group">
          <div class="srow" data-action="toast:Language · English"><span class="n">Language</span><span class="val">English ›</span></div>
          <div class="srow" data-action="toast:Units · kg · cm"><span class="n">Units</span><span class="val">kg · cm ›</span></div>
          <div class="srow" data-action="nav:reminders" style="cursor:pointer"><span class="n">Reminders</span><span class="val">›</span></div>
          <div class="srow" data-action="toast:Appearance · Dark"><span class="n">Appearance</span><span class="val">Dark ›</span></div>
        </div>
        <div class="section-label">YOUR DATA</div>
        <div class="group">
          <div class="srow" data-action="toast:Preparing your data export…"><div><div class="n">Export my data</div><div class="sub">Everything, as a file</div></div><span class="val">›</span></div>
          <div class="srow" data-action="toast:Photos encrypted · never sold"><div><div class="n">Privacy &amp; storage</div><div class="sub">Photos encrypted · never sold</div></div><span class="val">›</span></div>
        </div>
        <button class="btn btn-ghost" data-action="replay-onboarding" style="margin-bottom:10px">Replay onboarding</button>
        <button class="btn btn-ghost" data-action="signout">Sign out</button>
        <button style="width:100%;background:transparent;color:#ff453a;border:none;font-size:14px;font-weight:600;padding:12px;cursor:pointer;margin-top:6px" data-action="toast:Account deletion — full export first">Delete account</button>
      </div></div>`;
  }

  /* =========================================================
     Body-composition form (shared: intake 6a + Body measure) — E2/E6
     ========================================================= */
  function ifieldCard(k, big) {
    const v = state.iVals[k], ed = state.iEdit === k, empty = v == null;
    const valColor = ed ? 'var(--indigo-2)' : (empty ? 'var(--dim)' : 'var(--text)');
    const disp = ed ? (state.iBuf !== '' ? state.iBuf : (empty ? 'add' : String(v))) : (empty ? 'add' : String(v));
    return `<div class="ifield ${empty ? 'empty' : ''} ${ed ? 'editing' : ''}" data-action="i-open:${k}">
      <div class="k">${IFIELD_LABEL[k]}</div>
      <div style="display:flex;align-items:baseline;gap:3px;margin-top:3px"><span class="v" style="font-size:${big ? 19 : 16}px;color:${valColor}"${ed ? ' id="editcell"' : ''}>${disp}</span><span style="font-size:10px;color:var(--dim)">${empty ? '' : IUNIT[k]}</span></div>
    </div>`;
  }
  function bodyCompFields() {
    const v = state.iVals;
    const keys = Object.keys(v);
    const filled = keys.filter((k) => v[k] != null).length, total = keys.length;
    const whr = (v.waist && v.hip) ? (v.waist / v.hip).toFixed(2) : '—';
    const upFilled = IFIELDS.upper.filter(([k]) => v[k] != null).length;
    const loFilled = IFIELDS.lower.filter(([k]) => v[k] != null).length;
    const coreFilled = IFIELDS.core.filter(([k]) => v[k] != null).length;
    const html = `
      <div style="display:flex;align-items:center;gap:8px;margin:2px 0 9px"><span style="font-size:11px;font-weight:800;letter-spacing:.5px">INTI · CORE</span><span style="font-size:10px;font-weight:700;color:var(--green-ink);background:var(--green);padding:2px 7px;border-radius:999px">${coreFilled} / 4</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">${IFIELDS.core.map(([k]) => ifieldCard(k, true)).join('')}</div>
      <div style="display:flex;align-items:center;gap:9px;background:rgba(94,92,230,.12);border:1px solid rgba(148,140,255,.28);border-radius:12px;padding:10px 13px;margin-bottom:16px">
        <div style="width:26px;height:26px;border-radius:8px;background:rgba(148,140,255,.2);display:flex;align-items:center;justify-content:center;color:#b7b3ff;font-size:13px;font-weight:800">Σ</div>
        <div style="flex:1;font-size:12px;color:#c7c5f5">WHR otomatis · <span style="color:var(--indigo-2);font-weight:700">${whr}</span> <span style="color:var(--muted-2)">(waist ÷ hip)</span></div></div>
      <div data-action="i-toggle-upper" style="display:flex;align-items:center;justify-content:space-between;margin:2px 0 9px;cursor:pointer"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;font-weight:800;letter-spacing:.5px">TUBUH ATAS · UPPER</span><span style="font-size:10px;font-weight:700;color:var(--muted-2);background:rgba(255,255,255,.08);padding:2px 7px;border-radius:999px">${upFilled} / 8</span></div><span style="font-size:16px;color:var(--dim)">${state.iUpperOpen ? '⌄' : '›'}</span></div>
      ${state.iUpperOpen ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">${IFIELDS.upper.map(([k]) => ifieldCard(k)).join('')}</div>` : ''}
      <div data-action="i-toggle-lower" style="display:flex;align-items:center;justify-content:space-between;background:#141416;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:16px;cursor:pointer"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:11px;font-weight:800;letter-spacing:.5px;color:var(--text-2)">TUBUH BAWAH · LOWER</span><span style="font-size:10px;font-weight:700;color:var(--muted-2);background:rgba(255,255,255,.08);padding:2px 7px;border-radius:999px">${loFilled} / 5</span></div><span style="font-size:16px;color:var(--dim)">${state.iLowerOpen ? '⌄' : '›'}</span></div>
      ${state.iLowerOpen ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">${IFIELDS.lower.map(([k]) => ifieldCard(k)).join('')}</div>` : ''}`;
    return { html, filled, total, whr };
  }

  /* =========================================================
     Onboarding wizard (E2): program → experience → frequency → body-comp
     ========================================================= */
  function obProgress(step) {
    return `<div style="display:flex;align-items:center;gap:12px;padding:8px 20px 14px">
      <button class="icon-btn" data-action="${step === 0 ? 'skip-onboarding' : 'ob-prev'}" aria-label="Back">‹</button>
      <div style="display:flex;gap:6px;flex:1">${[0, 1, 2, 3].map((i) => `<div style="flex:1;height:4px;border-radius:2px;background:${i < step ? 'var(--green)' : i === step ? 'var(--indigo)' : 'rgba(255,255,255,.1)'}"></div>`).join('')}</div>
      <span style="font-size:12px;font-weight:700;color:var(--muted-2)">${step + 1} / 4</span></div>`;
  }
  function screenOnboarding() {
    const step = state.obStep;
    // Step 3 — body composition (6a) with keypad + generated overlay
    if (step === 3) {
      const bc = bodyCompFields();
      const p = state.plan || computePlan();
      const macroRow = (name, val, why, color) => `<div class="srow" style="align-items:flex-start"><div style="flex:1"><div class="n">${name}</div><div class="sub">${why}</div></div><div style="font-size:15px;font-weight:800;color:${color || 'var(--text)'};white-space:nowrap;margin-left:10px">${val}</div></div>`;
      const split = [['Sen·Mon', 'Push A', '~52m'], ['Sel·Tue', 'Pull A', '~50m'], ['Rab·Wed', 'Legs A', '~55m'], ['Kam·Thu', 'Push B', '~52m'], ['Jum·Fri', 'Pull B', '~50m'], ['Sab·Sat', 'Legs B', '~55m'], ['Min·Sun', 'Rest', '']]
        .map((r, i, a) => `<div class="srow"${i === a.length - 1 ? ' style="border-bottom:none"' : ''}><span style="font-size:13px;font-weight:600;color:var(--muted-2);width:64px;flex:none;padding-right:10px">${r[0]}</span><span style="font-size:14px;font-weight:600;flex:1;${!r[2] ? 'color:var(--muted)' : ''}">${r[1]}</span>${r[2] ? `<span style="font-size:12px;color:var(--muted-2)">${r[2]}</span>` : ''}</div>`).join('');
      const overlay = state.iGen ? `<div style="position:absolute;inset:0;background:#0a0a0b;z-index:20;display:flex;flex-direction:column">
          <div class="topbar"><button class="icon-btn" data-action="i-reset">‹</button><span class="t">Rencana kamu · Your plan</span></div>
          <div class="workout-scroll" style="flex:1;overflow-y:auto"><div class="pad" style="padding-top:0">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="ai-badge" style="width:30px;height:30px;font-size:11px">AI</div><span style="font-size:13px;font-weight:600;color:var(--indigo-3)">Coach built your plan · offline, zero cost</span></div>
            <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;line-height:1.15;margin-bottom:4px">${p.phaseLabel} · 4 minggu</div>
            <div style="font-size:13.5px;color:var(--muted-2);margin-bottom:16px">6-day Push / Pull / Legs · WHR ${bc.whr} jadi fokus. <span style="color:var(--dim)">Your generated plan.</span></div>
            <div style="display:flex;gap:10px;margin-bottom:16px">
              <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:11px;color:var(--muted-2);font-weight:600">Kalori · kcal</div><div style="font-size:22px;font-weight:800;margin-top:4px">${p.kcal.toLocaleString()}</div></div>
              <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:11px;color:var(--muted-2);font-weight:600">Protein</div><div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--orange)">${p.protein}<span style="font-size:13px;color:var(--muted-2)">g</span></div></div>
              <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:11px;color:var(--muted-2);font-weight:600">Trend</div><div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--green)">${p.trend}</div><div style="font-size:10px;color:var(--muted-2)">kg/mgg</div></div>
            </div>
            <div class="section-label">TARGET HARIAN · DAILY TARGETS <span style="color:var(--dim);font-weight:600">— tiap angka ada alasannya</span></div>
            <div class="group">
              ${macroRow('Kalori · Calories', p.kcal.toLocaleString() + ' kcal', p.why.kcal, 'var(--green)')}
              ${macroRow('Protein', p.protein + ' g', p.why.protein, 'var(--orange)')}
              ${macroRow('Karbo · Carbs', p.carbs + ' g', p.why.carbs)}
              ${macroRow('Lemak · Fat', p.fat + ' g', p.why.fat)}
              ${macroRow('BMR', p.bmr.toLocaleString() + ' kcal', p.bmrWhy)}
            </div>
            <div class="section-label">JADWAL MINGGU · YOUR WEEK</div>
            <div class="group">${split}</div>
            ${HINT('Latihan malam → kafein stop 14:00, makan terbesar habis latihan, whey pagi. · Night-training timing baked in.')}
            ${HINT('Beban awal dari top set terakhirmu · starting weights seeded from your logged history. Review mingguan mengkalibrasi ulang.')}
            <button class="btn btn-primary" data-action="ob-start" style="margin:6px 0 10px">Mulai Push A · Start →</button>
            <button data-action="i-reset" style="width:100%;background:transparent;border:none;color:var(--indigo-3);font-size:15px;font-weight:700;padding:8px;cursor:pointer">Ubah lagi · Adjust</button>
          </div></div>
        </div>` : '';
      return `<div class="route">
        ${obProgress(3)}
        <div style="padding:0 20px 12px">
          <div style="font-size:23px;font-weight:700;letter-spacing:-.5px;line-height:1.15">Ukur tubuhmu<span style="color:var(--indigo)"> ·</span> Body composition</div>
          <div style="font-size:12.5px;color:var(--muted-2);margin-top:5px;line-height:1.45">Isi yang kamu tahu — sisanya bisa nanti. <span style="color:var(--dim)">Fill what you know; the rest can wait.</span></div></div>
        <div class="workout-scroll" style="flex:1;overflow-y:auto"><div class="pad" style="padding-top:0">
          ${bc.html}
          <button class="btn btn-primary" data-action="i-generate" style="box-shadow:0 8px 24px -6px rgba(48,209,88,.5)">Buat rencanaku · Generate my plan →</button>
          <div style="text-align:center;font-size:11.5px;color:var(--dim);margin-top:11px">${bc.filled} dari ${bc.total} terisi · optional bisa dilewati</div>
        </div></div>
        ${state.iEdit != null ? keypad('i', IFIELD_LABEL[state.iEdit]) : ''}
        ${overlay}
      </div>`;
    }
    // Steps 0–2 — pick-one cards
    let title, sub, opts;
    if (step === 0) {
      title = 'Pilih program · Your program';
      sub = 'Ini menentukan kalori, makro & kecepatan progres. <span style="color:var(--dim)">Shapes your targets.</span>';
      const G = { cut: 'Cut · Turunkan lemak', recomp: 'Recomp · Tukar lemak jadi otot', bulk: 'Lean bulk · Bangun otot' };
      opts = GOALS.map(([k, , d]) => optCard(k, G[k], d, state.obGoal === k, 'ob-goal:' + k)).join('');
    } else if (step === 1) {
      title = 'Level pengalaman · Experience';
      sub = 'Menentukan beban awal & agresivitas progres. <span style="color:var(--dim)">Sets your starting load.</span>';
      opts = EXPERIENCE.map(([k, name, d]) => optCard(k, name, d, state.obExp === k, 'ob-exp:' + k)).join('');
    } else {
      title = 'Frekuensi · Sessions / week';
      sub = 'Berapa hari latihan seminggu? <span style="color:var(--dim)">Default 6-day PPL.</span>';
      opts = `<div style="display:flex;gap:10px;margin-top:26px">${[3, 4, 5, 6].map((n) => {
        const sel = state.obFreq === n;
        return `<button data-action="ob-freq:${n}" style="flex:1;aspect-ratio:1;border-radius:16px;border:1.5px solid ${sel ? 'var(--indigo)' : 'var(--line)'};background:${sel ? 'rgba(94,92,230,.1)' : 'var(--surface)'};color:${sel ? 'var(--text)' : 'var(--text-2)'};font-size:22px;font-weight:800;cursor:pointer">${n}</button>`;
      }).join('')}</div>
        <div style="font-size:12px;color:var(--muted-2);margin-top:14px;line-height:1.5">${state.obFreq === 6 ? '6-day Push/Pull/Legs — Munir&rsquo;s split, fully wired.' : `${state.obFreq}-day remap menyusul · only the 6-day split is wired this build.`}</div>`;
    }
    return `<div class="route">
      ${obProgress(step)}
      <div style="flex:1;display:flex;flex-direction:column;padding:6px 24px 22px">
        <div style="font-size:26px;font-weight:700;letter-spacing:-.5px;line-height:1.15">${title}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.45">${sub}</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:${step === 2 ? '0' : '24px'}">${opts}</div>
        <div style="flex:1"></div>
        <button class="btn btn-primary" data-action="ob-next" style="padding:17px">Lanjut · Continue</button>
      </div></div>`;
  }
  function optCard(k, name, sub, sel, action) {
    return `<button class="ob-opt ${sel ? 'sel' : ''}" data-action="${action}">
      <div style="flex:1"><div style="font-size:17px;font-weight:700">${name}</div><div style="font-size:13px;color:var(--muted);margin-top:2px">${sub}</div></div>
      <div class="radio">${sel ? '✓' : ''}</div></button>`;
  }

  /* =========================================================
     Consult chat (6c) — E7
     ========================================================= */
  function screenConsult() {
    const greeting = `<div class="qrow"><div class="qav">G</div><div class="qbubble coach">Halo Munir. Tanya apa aja soal latihan, makan, atau progresmu. <span style="color:var(--muted-2)">Ask me anything.</span></div></div>`;
    const chips = `<div style="display:flex;flex-wrap:wrap;gap:7px;margin-left:34px">${CONSULT_CHIPS.map(([label, q]) => `<button class="qchip" data-action="q-chip:${esc(q)}">${esc(label)}</button>`).join('')}</div>`;
    const msgs = state.qMsgs.map((mo) => {
      if (mo.role === 'user') return `<div class="qrow user"><div class="qbubble user">${esc(mo.text)}</div></div>`;
      const stats = mo.stats ? `<div style="margin:9px 0 0;padding:9px 11px;background:#141416;border-radius:10px;display:flex;gap:14px"><div><div style="font-size:10px;color:var(--muted-2)">Volume</div><div style="font-size:14px;font-weight:800;color:var(--green)">+6%</div></div><div><div style="font-size:10px;color:var(--muted-2)">Bench</div><div style="font-size:14px;font-weight:800">64 → 66.5</div></div><div><div style="font-size:10px;color:var(--muted-2)">WHR</div><div style="font-size:14px;font-weight:800;color:var(--orange)">${(state.iVals.waist / state.iVals.hip).toFixed(2)}</div></div></div>` : '';
      return `<div class="qrow"><div class="qav">G</div><div class="qbubble coach">${esc(mo.text)}${stats}</div></div>`;
    }).join('');
    const typing = state.qTyping ? `<div class="qrow"><div class="qav">G</div><div class="qbubble coach" style="display:flex;gap:5px;padding:13px 15px"><div style="width:7px;height:7px;border-radius:50%;background:var(--indigo-2);animation:pulseDot 1s infinite"></div><div style="width:7px;height:7px;border-radius:50%;background:var(--indigo-2);animation:pulseDot 1s .2s infinite"></div><div style="width:7px;height:7px;border-radius:50%;background:var(--indigo-2);animation:pulseDot 1s .4s infinite"></div></div></div>` : '';
    return `<div class="route">
      <div style="display:flex;align-items:center;gap:11px;padding:6px 20px 12px;border-bottom:1px solid var(--line);flex:none">
        <button class="icon-btn" data-action="nav:today">‹</button>
        <div style="position:relative;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#5e5ce6,#8f8bff);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#fff">G<div style="position:absolute;bottom:0;right:0;width:11px;height:11px;border-radius:50%;background:var(--green);border:2px solid #0a0a0b"></div></div>
        <div style="flex:1"><div style="font-size:16px;font-weight:700">Coach Gaspol</div><div style="font-size:11.5px;color:var(--green);font-weight:600">Offline · always on · zero cost</div></div>
      </div>
      <div class="chat" id="chatscroll">${greeting}${chips}${msgs}${typing}</div>
      <div class="qbar">
        <div class="qinput-wrap"><input id="qinput" placeholder="Tanya coach · Ask anything…" value="${esc(state.qInput)}"><button class="qsend" data-action="q-send">↑</button></div>
        <div style="text-align:center;font-size:10.5px;color:var(--dim);margin-top:8px">Jawaban dari data &amp; rencanamu · no external API</div>
      </div></div>`;
  }

  /* Standalone measurement form (Body → full measurements) — E6 */
  function screenMeasure() {
    const bc = bodyCompFields();
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:body">‹</button><span class="t">Ukur tubuh · Measurements</span></div>
      <div class="workout-scroll" style="flex:1;overflow-y:auto"><div class="pad" style="padding-top:0">
        <div style="font-size:12.5px;color:var(--muted-2);margin-bottom:14px">Isi yang kamu tahu — WHR otomatis. <span style="color:var(--dim)">Fill what you know.</span></div>
        ${bc.html}
        <button class="btn btn-primary" data-action="measure-done">Simpan · Save (${bc.filled}/${bc.total})</button>
      </div></div>
      ${state.iEdit != null ? keypad('i', IFIELD_LABEL[state.iEdit]) : ''}
    </div>`;
  }

  /* =========================================================
     Weekly review (1e) — F8
     ========================================================= */
  /** Colour a trailing "(+2.5)" / "(-50)" delta inside a change label. */
  function changeLabelHtml(label) {
    const m = String(label).match(/^(.*?)\(([+−-][^)]*)\)\s*$/);
    if (!m) return esc(label);
    const color = /^\+/.test(m[2]) ? 'var(--green)' : (/^[−-]/.test(m[2]) ? 'var(--orange)' : 'var(--muted-2)');
    return `${esc(m[1])}<span style="color:${color};font-weight:600">(${esc(m[2])})</span>`;
  }
  function screenReview() {
    const rv = state.review || SEED_REVIEW;
    const st = rv.stats || SEED_REVIEW.stats;
    const sw = state.session.exercises.find((e) => e.swappedFrom);
    const swapChange = sw ? [{ kind: 'swap', label: `${sw.swappedFrom} → ${sw.name}`, detail: 'Swapped mid-session — Coach re-estimated the load so progression still counts.' }] : [];
    const changes = swapChange.concat(rv.changes && rv.changes.length ? rv.changes : SEED_REVIEW.changes);
    const wc = st.weightChange;
    const wcStr = `${wc <= 0 ? '−' : '+'}${Math.abs(wc).toFixed(1)}`;
    const changesHtml = changes.map((c, i) => `<div class="change"${i === changes.length - 1 ? ' style="margin-bottom:16px"' : ''}>
      <div class="dot" style="background:${CHANGE_COLOR[c.kind] || 'var(--green)'}"></div>
      <div><div class="t">${changeLabelHtml(c.label)}</div><div class="d">${esc(c.detail)}</div></div></div>`).join('');
    return `<div>
      <div class="review-head"><button class="icon-btn" data-action="nav:today" style="font-size:18px">‹</button>
        <div><div class="sess-kicker">WEEKLY REVIEW</div><div class="sess-name">13–19 Jul · Week 3</div></div></div>
      <div class="pad" style="padding-top:0">
        <div class="review-verdict"><div class="ai-badge lg">AI</div><div><div class="l">COACH</div><div class="v">${esc(rv.title)}</div></div></div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="k">Sessions</div><div class="n">${st.sessions}<span style="font-size:14px;color:var(--muted-2)">/${st.sessionsTarget}</span></div><div class="s" style="color:var(--green)">${st.adherencePct}% adherence</div></div>
          <div class="stat-cell"><div class="k">Volume</div><div class="n" style="color:${st.volumePct >= 0 ? 'var(--green)' : 'var(--orange)'}">${st.volumePct >= 0 ? '+' : ''}${st.volumePct}%</div><div class="s">vs last week</div></div>
          <div class="stat-cell"><div class="k">Protein avg</div><div class="n" style="color:var(--orange)">${st.proteinAvg}<span style="font-size:14px;color:var(--muted-2)">g</span></div><div class="s">${st.proteinAvg < st.proteinFloor ? `under ${st.proteinFloor} g floor` : 'hit the floor'}</div></div>
          <div class="stat-cell"><div class="k">Weight</div><div class="n" style="color:${wc <= 0 ? 'var(--green)' : 'var(--orange)'}">${wcStr}<span style="font-size:14px;color:var(--muted-2)">kg</span></div><div class="s">on trend</div></div></div>
        <div class="section-label">CHANGES I MADE</div>
        ${changesHtml}
        <div class="coach"><div class="coach-head">${AB}<span class="coach-title">Coach note</span></div>
          <p>${esc(rv.body)}</p></div>
      </div></div>`;
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function currentScreen() {
    switch (state.tab) {
      case 'today': return screenToday();
      case 'workout': return screenWorkout();
      case 'food': return screenFood();
      case 'foodphoto': return screenFoodphoto();
      case 'body': return screenBody();
      case 'photos': return screenPhotos();
      case 'review': return screenReview();
      case 'report': return screenReport();
      case 'checkin': return screenCheckin();
      case 'settings': return screenSettings();
      case 'reminders': return screenReminders();
      case 'onboarding': return screenOnboarding();
      case 'consult': return screenConsult();
      case 'measure': return screenMeasure();
      default: return screenToday();
    }
  }
  function renderTabbar() {
    const bar = $('#tabbar');
    if (!TAB_SCREENS.includes(state.tab)) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.innerHTML = TABS.map(([key, label]) =>
      `<button class="tab ${state.tab === key ? 'active' : ''}" data-action="nav:${key}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[key]}</svg><span>${label}</span></button>`).join('');
  }
  function render() {
    if (state.gate === 'auth') {
      $('#view').innerHTML = screenAuth();
      $('#tabbar').style.display = 'none';
      wireAuth();
      return;
    }
    $('#view').innerHTML = currentScreen();
    renderTabbar();
    if (state.tab === 'photos') wireCompare();
    if (state.tab === 'consult') wireConsult();
    if (state.tab === 'foodphoto') wireFoodphoto();
  }
  function wireFoodphoto() {
    const inp = $('#foodfile'); if (!inp) return;
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      let dataUrl, img;
      try { ({ dataUrl, img } = await Vision.compressImage(file)); }
      catch (e) { showToast('Gagal baca foto · could not read photo'); return; }
      state.fp = { ...state.fp, stage: 'analyzing', img: dataUrl };
      state.portionIdx = 2; render();
      let est = null;
      try { est = await Vision.estimate(img); } catch (e) { /* model unavailable */ }
      state.fp = est
        ? { stage: 'result', img: dataUrl, dish: est.dish, kcalBase: est.kcal, proteinBase: est.protein, conf: est.confidence, matched: est.matched, raw: est.raw }
        : { stage: 'result', img: dataUrl, dish: 'Mixed meal · adjust', kcalBase: 620, proteinBase: 34, conf: 0, matched: false, raw: [] };
      render();
    });
  }
  function resetFp() { state.fp = { stage: 'capture', img: null, dish: null, kcalBase: 620, proteinBase: 34, conf: 0, matched: false, raw: [] }; }
  function wireAuth() {
    const inp = $('#authemail'); if (!inp) return;
    inp.addEventListener('input', () => { state.authEmail = inp.value; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['auth-magic'](); } });
  }
  function wireConsult() {
    const chat = $('#chatscroll'); if (chat) chat.scrollTop = chat.scrollHeight;
    const inp = $('#qinput'); if (!inp) return;
    inp.addEventListener('input', () => { state.qInput = inp.value; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); consultSend(); } });
    if (!state.qTyping) inp.focus();
  }
  function paintRest() { const r = $('#restRegion'); if (r) r.innerHTML = restRegion(); }

  function wireCompare() {
    const input = $('#cmp'); if (!input) return;
    input.addEventListener('input', () => {
      const v = Number(input.value); state.photoCompare = v;
      const top = $('#cmp-top'), line = $('#cmp-line'), knob = $('#cmp-knob');
      if (top) top.style.width = v + '%';
      if (line) line.style.left = v + '%';
      if (knob) knob.style.left = v + '%';
    });
  }

  /* ---- Toast ------------------------------------------------ */
  let toastTimer = null;
  function showToast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; $('.screen').appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  /* =========================================================
     ACTIONS
     ========================================================= */
  function logSet(i) {
    const ex = curEx();
    const s = ex.sets[i];
    if (!s || s.done) return;
    s.done = true; s.reps = s.reps || ex.repHigh; s.rpe = s.rpe || 8;
    state.rest = ex.rest; state.restTotal = ex.rest; state.bEdit = null;
    // Persist through the data layer when the backend is wired (offline-queued).
    if (BE.on && ex.id != null) {
      BE.api.logSet({ exerciseId: ex.id, setNumber: i + 1, weight: s.kg, reps: s.reps, rpe: s.rpe }).catch(() => {});
    }
    render();
    if (ex.sets.every((x) => x.done)) {
      const last = state.exIdx === state.session.exercises.length - 1;
      showToast(last ? 'Last exercise done — finish when ready' : 'Exercise done — next up');
    }
  }
  function nextExercise() {
    if (state.exIdx < state.session.exercises.length - 1) { state.exIdx += 1; state.rest = 0; render(); $('#view').scrollTop = 0; }
  }
  function chooseAlt(idx) {
    const a = ALTS[idx]; if (!a) return;
    const ex = curEx();
    ex.swappedFrom = ex.name; ex.name = a.name; ex.weight = a.weight || ex.weight;
    ex.sets.forEach((s) => { s.kg = ex.weight; });
    state.swapOpen = false; state.filter = 'all';
    render(); showToast(`Swapped to ${a.name} · weight re-estimated`);
  }

  /** Finish the session: compute realization + F3 progression, then report. */
  function finishSession() {
    const realization = [];
    const changes = [];
    let volume = 0, setsDone = 0;
    for (const ex of state.session.exercises) {
      const logged = ex.sets.filter((s) => s.done);
      setsDone += logged.length;
      volume += logged.reduce((a, s) => a + s.kg * s.reps, 0);
      if (logged.length) {
        const minReps = Math.min(...logged.map((s) => s.reps));
        const rz = minReps >= ex.repHigh
          ? { tag: 'Exceeded ↑', color: 'var(--green)', bg: 'rgba(48,209,88,.14)' }
          : minReps >= ex.repLow
            ? { tag: 'Hit ✓', color: 'var(--indigo-3)', bg: 'rgba(94,92,230,.16)' }
            : { tag: 'Under ↓', color: 'var(--orange)', bg: 'rgba(255,159,10,.14)' };
        realization.push({
          name: ex.name, prescribed: schemeOf(ex),
          performed: `${logged.length}×${minReps} @ ${fmtKg(ex.weight)}`, ...rz,
        });
        // F3 progression from progression.js
        const res = evaluateProgression(
          { current_weight: ex.weight, increment: ex.increment, is_compound: ex.isCompound, rep_low: ex.repLow, rep_high: ex.repHigh },
          [{ sets: logged.map((s) => ({ weight: s.kg, reps: s.reps })) }],
        );
        if (res.action !== 'hold' && res.newWeight !== ex.weight) {
          ex.prevWeight = ex.weight;
          ex.pendingWeight = res.newWeight;   // applied for "next session"
          changes.push({ ex, name: ex.name, from: ex.weight, to: res.newWeight, delta: res.newWeight - ex.weight, reason: res.reason });
          if (BE.on && ex.id != null) {
            BE.api.applyProgression(
              { id: ex.id, current_weight: ex.weight, increment: ex.increment, is_compound: ex.isCompound, rep_low: ex.repLow, rep_high: ex.repHigh },
              [{ sets: logged.map((s) => ({ weight: s.kg, reps: s.reps })) }],
            ).catch(() => {});
          }
        }
      }
    }
    const note = changes.length
      ? `${changes.length} lift${changes.length > 1 ? 's' : ''} progressed — I've set next session's weights. Everything else holds; keep the top sets honest.`
      : 'Clean session logged. Hold these weights and chase the top of each rep range next time.';
    state.report = { realization, changes, volume: Math.round(volume), sets: setsDone, note, undone: false };
    state.tab = 'report'; render(); $('#view').scrollTop = 0;
  }

  function undoProgression() {
    if (!state.report || state.report.undone) return;
    for (const c of state.report.changes) {
      c.ex.pendingWeight = c.ex.prevWeight;    // revert display
      if (BE.on && c.ex.id != null) {
        BE.api.applyProgression(  // write the old weight back (force via a hold-style set)
          { id: c.ex.id, current_weight: c.to, increment: c.from - c.to, is_compound: c.ex.isCompound, rep_low: c.ex.repLow, rep_high: c.ex.repHigh },
          [{ sets: [{ weight: c.to, reps: c.ex.repHigh }] }],
        ).catch(() => {});
      }
    }
    state.report.undone = true;
    render(); showToast('Progression reverted — weights held');
  }

  async function finishReport() {
    // Reset for a fresh session; re-hydrate from backend when wired.
    state.report = null; state.exIdx = 0;
    if (BE.on) { await hydrateSession(); } else { state.session = SESSION_SEED(); }
    state.rest = 0; state.tab = 'today'; render(); showToast('Session saved · streak 12 days');
  }

  function addPreset(k) {
    const p = PRESETS[k]; if (!p) return;
    state.meals.push({ name: p.name, sub: `${nowTime()} · ${p.protein} g protein`, kcal: p.kcal, protein: p.protein });
    if (BE.on) BE.api.logFood({ meal: k, name: p.name, kcal: p.kcal, protein: p.protein }).catch(() => {});
    render(); showToast(`Added · ${k} (${p.kcal} kcal)`);
  }
  function logPhoto() {
    const fp = state.fp; const p = PORTIONS[state.portionIdx];
    const kcal = Math.round((fp.kcalBase || 620) * p.mult / 10) * 10, protein = Math.round((fp.proteinBase || 34) * p.mult);
    const name = fp.dish || 'Mixed meal';
    state.meals.push({ name, sub: `${nowTime()} · ${protein} g protein`, kcal, protein, ai: true });
    if (BE.on) BE.api.logFood({ meal: 'AI photo', name, kcal, protein }).catch(() => {});
    state.tab = 'food'; state.portionIdx = 2; resetFp(); render(); showToast(`Logged · ${kcal} kcal (estimate)`);
  }

  /* ---- Editable sets (6b) + shared keypad ------------------ */
  function bTap(row, field) { state.bEdit = { row, field }; state.bBuf = ''; render(); }
  function addSet() { const s = curEx().sets; const last = s[s.length - 1] || { kg: curEx().weight }; s.push({ kg: last.kg, reps: 0, rpe: 0, prev: '—', done: false }); render(); }
  function delSet() { const s = curEx().sets; if (s.length > 1) s.pop(); state.bEdit = null; render(); }
  function applyProgression() { const ex = curEx(); ex.sets.forEach((s) => { if (!s.done) s.kg = ex.weight + ex.increment; }); ex.applied = true; render(); showToast(`Naikkan · +${fmtKg(ex.increment)} kg applied`); }
  function keypadPress(ctx, d) {
    const key = ctx === 'i' ? 'iBuf' : 'bBuf';
    let b = state[key];
    if (d === 'bk') b = b.slice(0, -1);
    else if (d === '.') { if (!b.includes('.')) b = (b || '0') + '.'; }
    else b = b + d;
    state[key] = b;
    const cell = document.getElementById('editcell'); if (cell) cell.textContent = b === '' ? '0' : b;
  }
  function keypadDone(ctx) {
    if (ctx === 'b') {
      if (state.bEdit && state.bBuf !== '') curEx().sets[state.bEdit.row][state.bEdit.field] = parseFloat(state.bBuf) || 0;
      state.bEdit = null; state.bBuf = '';
    } else {
      if (state.iEdit != null && state.iBuf !== '') state.iVals[state.iEdit] = parseFloat(state.iBuf);
      state.iEdit = null; state.iBuf = '';
    }
    render();
  }

  /* ---- Intake (6a) ----------------------------------------- */
  function iOpen(k) { state.iEdit = k; state.iBuf = ''; render(); }
  function bodyFromIVals() {
    const v = state.iVals;
    return {
      weightKg: v.weight, waistCm: v.waist, hipCm: v.hip, bfPct: v.bodyfat, muscleKg: v.lbm,
      neckCm: v.neck, shoulderCm: v.shoulder, chestCm: v.chest, abdomenCm: v.abdomen,
      bicepsLCm: v.bicepsL, bicepsRCm: v.bicepsR, forearmLCm: v.forearmL, forearmRCm: v.forearmR,
      thighLCm: v.thighL, thighRCm: v.thighR, calfLCm: v.calfL, calfRCm: v.calfR,
    };
  }
  /* Embedded, deterministic plan-generation engine (E3). No external API. */
  function computePlan() {
    const v = state.iVals;
    const w = Number(v.weight) || 70;
    const bf = Number(v.bodyfat);
    const lbm = Number(v.lbm) || (bf ? Math.round(w * (1 - bf / 100) * 10) / 10 : 0);
    // BMR: Katch-McArdle from lean mass (uses the body-comp we collected);
    // else Mifflin-St Jeor with a labelled height/age estimate.
    let bmr, bmrWhy;
    if (lbm) { bmr = Math.round(370 + 21.6 * lbm); bmrWhy = `Katch-McArdle · LBM ${fmtKg(lbm)} kg`; }
    else { bmr = Math.round(10 * w + 6.25 * 172 - 5 * 28 + 5); bmrWhy = 'Mifflin-St Jeor · height/age estimated'; }
    const activity = ({ 3: 1.35, 4: 1.42, 5: 1.48, 6: 1.53 })[state.obFreq] || 1.5;
    const tdee = Math.round(bmr * activity);
    const goal = state.obGoal;
    const adj = goal === 'cut' ? -400 : goal === 'bulk' ? 250 : 0;
    const kcal = Math.max(1400, Math.floor((tdee + adj) / 50) * 50);
    const gPerKg = goal === 'cut' ? 2.25 : goal === 'bulk' ? 2.0 : 2.2;
    const protein = Math.round(gPerKg * w / 5) * 5;
    const fat = Math.round(0.25 * kcal / 9 / 5) * 5;
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const phaseLabel = GOALS.find((g) => g[0] === goal)[1];
    const trend = goal === 'cut' ? '−0.5' : goal === 'bulk' ? '+0.25' : '0.0';
    return {
      bmr, bmrWhy, activity, tdee, kcal, protein, carbs, fat, trend, phaseLabel, goal,
      why: {
        kcal: goal === 'cut' ? `TDEE ${tdee.toLocaleString()} − 400 · defisit ~0.5 kg/mgg` : goal === 'bulk' ? `TDEE ${tdee.toLocaleString()} + 250 · surplus pelan` : `= TDEE ${tdee.toLocaleString()} · maintenance`,
        protein: `${gPerKg} g/kg × ${fmtKg(w)} kg — jaga otot · protect muscle`,
        fat: '25% kalori — hormon & kenyang',
        carbs: 'sisa energi buat latihan · fuel',
      },
    };
  }
  function generatePlan() {
    state.plan = computePlan();
    state.iGen = true; state.iEdit = null;
    if (BE.on) BE.api.saveBody(bodyFromIVals()).catch(() => {});
    render();
  }

  /* ---- Consult (6c) — embedded, rule-based intent engine --- */
  function consultSend(text) {
    const t = (text || state.qInput || '').trim(); if (!t) return;
    state.qMsgs.push({ role: 'user', text: t }); state.qInput = ''; state.qTyping = true;
    render();
    setTimeout(() => {
      const ans = answerFor(t);
      state.qMsgs.push(ans); state.qTyping = false; render();
      if (BE.on) BE.api.consult(t, ans.text).catch(() => {});
    }, 700);
  }
  function answerFor(t) {
    const s = t.toLowerCase(); const m = (...w) => w.some((x) => s.includes(x));
    if (m('progres', 'progress')) return { role: 'coach', stats: true, text: 'Solid. Berat 70.4 → 68.6 kg sejak 25 Apr, BF 13.6 → 13.4% — cut jalan tanpa kehilangan otot. · Progress is on track.' };
    if (m('latihan', 'train', 'hari ini', 'today', 'workout')) return { role: 'coach', text: 'Push A hari ini: Bench 4×6–8 @ 64 kg, OHP, Incline DB, Lateral raise, Triceps. ~50 menit. · Push day today.' };
    if (m('makro', 'macro', 'protein', 'kalori', 'kcal', 'calorie')) return { role: 'coach', text: 'Target hari ini: 2.150 kcal · Protein 155 g · Karbo 190 g · Lemak 60 g. Protein prioritas tiap makan. · Hit protein first.' };
    if (m('beban', 'berikut', 'next', 'weight', 'naik')) return { role: 'coach', text: 'Sesi berikut — Bench naik ke 66.5 kg kalau semua set kena top range. OHP tetap 40 kg. · Bench goes up.' };
    if (m('whr', 'waist', 'pinggang')) return { role: 'coach', text: `WHR kamu ${(state.iVals.waist / state.iVals.hip).toFixed(2)} vs target <0.90. Masih di atas target — tahan cut, tambah kerja core. · Hold the cut.` };
    if (m('kafein', 'caffeine', 'kopi')) return { role: 'coach', text: 'Latihan jam 18:00 → stop kafein jam 14:00 biar tidur nggak keganggu. · Cut caffeine by 2 pm.' };
    if (m('tidur', 'sleep', 'recovery', 'pulih')) { const r = recoveryStatus(); return { role: 'coach', text: r.deload ? `Tidur rata-rata ${r.avgSleep} jam &amp; soreness tinggi 2 hari terakhir — Coach kurangi volume Kamis ~20% biar pulih. · Pull back Thursday.` : `Tidur rata-rata ${r.avgSleep} jam minggu ini. Recovery cukup buat lanjut sesuai rencana — tetap tidur lebih awal ya. · On plan.` }; }
    if (m('ukur', 'measure', 'lengan', 'dada', 'measurement')) return { role: 'coach', text: 'Ukuran terakhir: pinggang 88 cm (−1 sejak Apr), lengan 35 cm, dada 97 cm. Ukur lagi tiap Minggu. · Re-measure weekly.' };
    if (m('fase', 'phase', 'cut', 'bulk', 'defisit', 'deficit')) return { role: 'coach', text: 'Fase sekarang: Cut, minggu 3 dari 4. Defisit ~400 kcal/hari. Perkiraan selesai ~1 minggu lagi lalu maintenance. · You are cutting.' };
    return { role: 'coach', text: 'Aku jawab dari data & rencanamu — coba tanya soal latihan hari ini, target makro, progres, recovery, atau WHR. · Ask about your plan or data.' };
  }

  const ACTIONS = {
    'nav': (a) => { if (a === 'foodphoto' && state.fp.stage !== 'capture') resetFp(); state.tab = a; render(); $('#view').scrollTop = 0; },
    'log-set': (a) => logSet(Number(a)),
    'next-exercise': () => nextExercise(),
    'b-tap': (a) => { const [row, field] = a.split(':'); bTap(Number(row), field); },
    'kp': (a) => { const [ctx, d] = a.split(':'); keypadPress(ctx, d); },
    'kp-done': (a) => keypadDone(a),
    'apply-progression': () => applyProgression(),
    'add-set': () => addSet(),
    'del-set': () => delSet(),
    'i-open': (a) => iOpen(a),
    'i-toggle-upper': () => { state.iUpperOpen = !state.iUpperOpen; render(); },
    'i-toggle-lower': () => { state.iLowerOpen = !state.iLowerOpen; render(); },
    'i-generate': () => generatePlan(),
    'i-reset': () => { state.iGen = false; render(); },
    'measure-done': () => { state.iGen = false; state.tab = state.iReturn || 'body'; render(); showToast('Ukuran tersimpan · measurements saved'); },
    'q-send': () => consultSend(),
    'q-chip': (a) => consultSend(a),
    'ob-exp': (a) => { state.obExp = a; render(); },
    'ob-freq': (a) => { state.obFreq = Number(a); render(); },
    'ob-prev': () => { state.obStep = Math.max(0, state.obStep - 1); render(); $('#view').scrollTop = 0; },
    'finish-session': () => finishSession(),
    'skip-rest': () => { state.rest = 0; paintRest(); },
    'open-swap': () => { state.swapOpen = true; render(); },
    'close-swap': () => { state.swapOpen = false; render(); },
    'filter': (a) => { state.filter = a; render(); },
    'choose-alt': (a) => chooseAlt(Number(a)),
    'undo-progression': () => undoProgression(),
    'finish-report': () => { finishReport(); },
    'add-preset': (a) => addPreset(a),
    'log-photo': () => logPhoto(),
    'fp-shoot': () => { const el = $('#foodfile'); if (el) el.click(); },
    'fp-retake': () => { resetFp(); render(); },
    'fp-pick': () => { resetFp(); state.tab = 'food'; render(); showToast('Pilih makanan dari daftar · pick from your list'); },
    'portion': (a) => { const d = Number(a); state.portionIdx = d === 0 ? 2 : Math.max(0, Math.min(PORTIONS.length - 1, state.portionIdx + d)); render(); },
    'photoview': (a) => { state.photoView = a; render(); },
    'rate': (a) => { const [kind, n] = a.split(':'); state.checkin[kind] = Number(n); render(); },
    'save-checkin': () => {
      const c = { sleep: state.checkin.sleep, energy: state.checkin.energy, soreness: state.checkin.soreness };
      state.checkinHistory = [...state.checkinHistory.slice(-6), c]; // keep a rolling 7-day window (E8)
      if (BE.on) BE.api.saveCheckin({ sleepHours: c.sleep, energy: c.energy, soreness: c.soreness }).catch(() => {});
      state.tab = 'today'; render(); showToast('Check-in saved · thanks, Munir');
    },
    'toggle': (a) => { state.reminders[a] = !state.reminders[a]; if (BE.on) BE.api.setReminder(a, state.reminders[a]).catch(() => {}); render(); },
    'log-weight': () => { if (BE.on) BE.api.logWeighIn({ weightKg: 74.2 }).catch(() => {}); showToast('Weigh-in saved · 74.2 kg'); },
    'toast': (a) => showToast(a),
    'ob-goal': (a) => { state.obGoal = a; render(); },
    'ob-next': () => { state.obStep = Math.min(3, state.obStep + 1); render(); $('#view').scrollTop = 0; },
    'ob-start': () => {
      finishOnboarding();
      if (state.plan) { // apply generated targets to the whole app
        state.kcalTarget = state.plan.kcal; state.proteinTarget = state.plan.protein;
        if (BE.on) BE.api.setSetting('targets', { kcal: state.plan.kcal, protein: state.plan.protein, carbs: state.plan.carbs, fat: state.plan.fat }).catch(() => {});
      }
      state.iGen = false; state.tab = 'workout'; render();
    },
    'skip-onboarding': () => { finishOnboarding(); state.tab = 'today'; render(); },
    'replay-onboarding': () => { state.obStep = 0; state.iGen = false; state.tab = 'onboarding'; render(); $('#view').scrollTop = 0; },
    'nav-measure': () => { state.iReturn = 'body'; state.iGen = false; state.tab = 'measure'; render(); $('#view').scrollTop = 0; },
    'nav-consult': () => { state.tab = 'consult'; render(); },
    /* ---- Auth gate (F10) ---- */
    'auth-google': () => {
      if (!BE.on) { showToast('Server tak terjangkau · server unreachable'); return; }
      state.authBusy = true; render();
      BE.api.signInWithGoogle().catch(() => { state.authBusy = false; showToast('Sign-in gagal · failed'); render(); });
    },
    'auth-magic': () => {
      const email = (state.authEmail || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showToast('Masukkan email yang valid · enter a valid email'); return; }
      if (!BE.on) { showToast('Server tak terjangkau · server unreachable'); return; }
      state.authBusy = true; render();
      BE.api.sendMagicLink(email)
        .then(({ error }) => { state.authBusy = false; if (error) { showToast('Gagal kirim link · ' + error.message); } else { state.authSent = true; } render(); })
        .catch(() => { state.authBusy = false; showToast('Gagal kirim link · try again'); render(); });
    },
    'signout': () => {
      if (BE.on && BE.api.userId) { BE.api.signOut().catch(() => {}).then(() => location.reload()); }
      else showToast('Signed out');
    },
  };
  function finishOnboarding() { try { localStorage.setItem('gaspol_onboarded', '1'); } catch (e) { /* ignore */ } state.obStep = 0; }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const raw = el.getAttribute('data-action');
    const sep = raw.indexOf(':');
    const name = sep === -1 ? raw : raw.slice(0, sep);
    const arg = sep === -1 ? undefined : raw.slice(sep + 1);
    const fn = ACTIONS[name];
    if (fn) { e.preventDefault(); fn(arg); }
  });

  /* ---- 1s clock: rest timer -------------------------------- */
  setInterval(() => {
    if (state.rest > 0 && !curEx().sets.every((s) => s.done)) {
      state.rest -= 1;
      if (state.tab === 'workout') paintRest();
    }
  }, 1000);

  /* =========================================================
     BOOT (+ optional backend hydrate)
     ========================================================= */
  function mapSession(today) {
    return {
      name: today.session || 'Today',
      exercises: today.exercises.map((e) => ({
        id: e.id, name: e.name, isCompound: e.isCompound,
        targetSets: e.prescribed.sets, repLow: e.prescribed.repLow, repHigh: e.prescribed.repHigh,
        weight: e.prescribed.weight, increment: e.isCompound ? 2.5 : 1,
        rest: e.restSec || 90, swappedFrom: null, progressed: false, applied: false,
        sets: e.sets.map((s) => ({ kg: s.kg, reps: s.reps, rpe: 0, prev: s.prev || '—', done: false })),
      })),
    };
  }
  async function hydrateSession() {
    const today = await BE.api.getTodaySession();
    if (today && today.exercises && today.exercises.length) { state.session = mapSession(today); state.exIdx = 0; }
    else state.session = SESSION_SEED();
  }
  async function hydrateFood() {
    const day = await BE.api.getFoodDay();
    if (day && Array.isArray(day.meals)) state.meals = day.meals.map(mapFoodRow);
    const s = await BE.api.getSettings();
    if (s && s.targets) {
      if (s.targets.kcal) state.kcalTarget = Number(s.targets.kcal);
      if (s.targets.protein) state.proteinTarget = Number(s.targets.protein);
    }
  }
  async function hydrateBody() {
    const rows = await BE.api.getBodyTrend(35);
    if (!rows || !rows.length) return;
    const weights = rows.filter((r) => r.weight_kg != null).map((r) => Number(r.weight_kg));
    if (weights.length) state.body.trend = weights;
    const latest = rows[rows.length - 1];
    if (latest.weight_kg != null) state.body.weightKg = Number(latest.weight_kg);
    if (latest.waist_cm != null) state.body.waist = Number(latest.waist_cm);
    if (latest.hip_cm != null) state.body.hip = Number(latest.hip_cm);
    if (latest.bf_pct != null) state.body.bf = Number(latest.bf_pct);
    const wc = weeklyChangeFromRows(rows);
    if (wc != null) state.body.weekChange = wc;
  }
  async function hydrateCheckin() {
    const c = await BE.api.getCheckin();
    if (c) state.checkin = {
      sleep: c.sleep_hours != null ? Number(c.sleep_hours) : state.checkin.sleep,
      energy: c.energy || state.checkin.energy,
      soreness: c.soreness || state.checkin.soreness,
    };
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtScanDate(iso) {
    if (!iso) return state.scan.date;
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : `${d.getDate()} ${MON[d.getMonth()]}`;
  }
  async function hydrateScan() {
    const sc = await BE.api.getScan();
    if (!sc || !sc.segments) return; // no scan on file → keep the seed card
    state.scan = {
      date: fmtScanDate(sc.date),
      bmi: sc.bmi ?? state.scan.bmi, bmr: sc.bmr ?? state.scan.bmr,
      visceral: sc.visceral ?? state.scan.visceral, bodyAge: sc.bodyAge ?? state.scan.bodyAge,
      musclePct: sc.musclePct ?? state.scan.musclePct, fatPct: sc.fatPct ?? state.scan.fatPct,
      whr: sc.whr ?? state.scan.whr, segments: sc.segments,
    };
  }
  async function hydrateCheckinHistory() {
    const h = await BE.api.getCheckinHistory(7);
    if (!h || !h.length) return; // no logged check-ins yet → keep the 7-day seed
    state.checkinHistory = h.map((x) => ({
      sleep: x.sleep != null ? x.sleep : state.checkin.sleep,
      energy: x.energy || 3, soreness: x.soreness || 2,
    }));
  }
  async function hydrateConsult() {
    const log = await BE.api.getConsultLog();
    if (!log || !log.length) return; // fresh install → start with an empty thread
    const msgs = [];
    for (const e of log) {
      if (e.q) msgs.push({ role: 'user', text: e.q });
      if (e.a) msgs.push({ role: 'coach', text: e.a });
    }
    if (msgs.length) state.qMsgs = msgs;
  }
  async function hydrateReminders() {
    const r = await BE.api.getReminders();
    if (r && Object.keys(r).length) state.reminders = { ...state.reminders, ...r };
  }
  async function hydrateReview() {
    const rv = await BE.api.getWeeklyReview();
    if (rv) state.review = rv;
  }
  async function hydrateProfile() {
    const p = await BE.api.getProfile();
    if (!p) return;
    if (p.name) state.profile.name = p.name;
    if (p.email) { state.profile.email = p.email; state.profile.joined = ''; }
    if (typeof p.premium === 'boolean') state.profile.premium = p.premium;
  }
  function weeklyChangeFromRows(rows) {
    const pts = rows.filter((r) => r.weight_kg != null);
    if (pts.length < 2) return null;
    const latest = Number(pts[pts.length - 1].weight_kg);
    const d = new Date(); d.setDate(d.getDate() - 7);
    const cutoff = d.toISOString().slice(0, 10);
    const earlier = pts.find((p) => p.log_date >= cutoff) || pts[0];
    return Math.round((latest - Number(earlier.weight_kg)) * 10) / 10;
  }
  const settle = (p) => p.catch((e) => console.warn('[Gaspol] hydrate skipped:', e));
  async function boot() {
    try { if (!localStorage.getItem('gaspol_onboarded')) state.tab = 'onboarding'; } catch (e) { /* ignore */ }
    if (typeof window !== 'undefined' && window.GASPOL_CONFIG) {
      const requireAuth = !!window.GASPOL_CONFIG.requireAuth;
      try {
        const mod = await import('./data.js');
        await mod.GaspolData.init();
        BE.api = mod.GaspolData; BE.on = true;
      } catch (e) { console.warn('[Gaspol] backend unavailable — running on seed data.', e); BE.on = false; }
      // With requireAuth on, don't reveal data until there is a real session.
      // Fail-closed: no session (or backend down) → show the sign-in gate.
      if (requireAuth && !(BE.on && BE.api.userId)) { state.gate = 'auth'; render(); return; }
      if (BE.on) {
        try {
          // Hydrate every read-driven tab; each is best-effort so one failure
          // (or an empty table) leaves that tab on its seed values.
          await settle(hydrateSession());
          await Promise.all([settle(hydrateFood()), settle(hydrateBody()), settle(hydrateScan()), settle(hydrateCheckin()), settle(hydrateCheckinHistory()), settle(hydrateConsult()), settle(hydrateReminders()), settle(hydrateReview()), settle(hydrateProfile())]);
        } catch (e) { console.warn('[Gaspol] hydrate error:', e); }
      }
    }
    render();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
    }
  }
  boot();
})();
