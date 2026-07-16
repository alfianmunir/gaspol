/* ============================================================
   Gaspol — app logic
   Faithful implementation of Gaspol.dc.html (18 screens, F1–F10):
   dark, AI-first mobile coach. Vanilla JS state + render engine,
   installable offline PWA. Persona P1 "Munir" · Cut · Week 3.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Reference data --------------------------------- */
  const ALTS = [
    { name: 'Machine Chest Press', equip: 'Machine', cat: 'machine', match: 96, scheme: '4 × 8–10 @ 50 kg', best: true, note: 'Closest match to your bench strength curve.' },
    { name: 'Dumbbell Bench Press', equip: 'Dumbbells', cat: 'dumbbell', match: 92, scheme: '4 × 8–10 @ 28 kg', note: 'More stabiliser work — log per dumbbell.' },
    { name: 'Incline Machine Press', equip: 'Machine', cat: 'machine', match: 85, scheme: '4 × 8–10 @ 40 kg', note: 'Shifts load onto upper chest.' },
    { name: 'Weighted Push-Up', equip: 'Bodyweight', cat: 'body', match: 78, scheme: '4 × 12–15 reps', note: 'No kit needed — add a plate on your back.' },
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

  /* ---------- App state -------------------------------------- */
  const state = {
    tab: 'today',        // today | workout | food | body | review  (+ full-screen routes below)
    // full-screen routes: onboarding | report | checkin | settings | reminders | photos | foodphoto
    obStep: 0, obGoal: 'cut',
    // workout
    exName: 'Bench Press', exScheme: '4 × 6–8 @ 64 kg', progressed: true,
    sets: [
      { kg: 64, reps: 8, prev: '62×8', done: false },
      { kg: 64, reps: 8, prev: '62×8', done: false },
      { kg: 64, reps: 8, prev: '62×7', done: false },
      { kg: 64, reps: 8, prev: '62×7', done: false },
    ],
    rest: 0, restTotal: 90,
    swapOpen: false, filter: 'all', swapped: false, swappedFrom: null,
    // nutrition
    kcalTarget: 2150, proteinTarget: 155,
    meals: [
      { name: 'Sarapan · oat + telur', sub: '07:20 · 32 g protein', kcal: 440, protein: 32 },
      { name: 'Makan siang · nasi + ayam', sub: '12:40 · 34 g protein', kcal: 620, protein: 34, ai: true },
      { name: 'Snack · Greek yogurt', sub: '15:30 · 22 g protein', kcal: 360, protein: 22 },
    ],
    portionIdx: 2,
    // body
    photoView: 'front', photoCompare: 50,
    // check-in
    checkin: { sleep: 6.9, energy: 4, soreness: 4 },
    // reminders (F9)
    reminders: {
      sessionStart: true, weighIn: true, weeklyReview: true,
      preworkout: true, caffeine: false, weeklyPhoto: true, streakRepair: false, whatsapp: false,
    },
  };

  /* ---------- Helpers ---------------------------------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

  const AB = '<div class="ai-badge">AI</div>';           // small AI badge
  const HINT = (html) => `<div class="hint"><span class="b"></span><span>${html}</span></div>`;

  /* =========================================================
     SCREENS — Today (1a)
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
          <button class="gear" data-action="nav:settings" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS.gear}</svg></button>
        </div>
      </div>

      <div class="coach" style="margin-bottom:16px">
        <div class="coach-head">${AB}<span class="coach-title">Coach</span><span class="dot-live"></span>
          <span style="font-size:11px;color:rgba(255,255,255,.5);margin-left:auto">Updated just now</span></div>
        <p>Bench cleared its top set two weeks running — I moved <b>Thursday to 64&nbsp;kg</b>. You're <b>1.2&nbsp;kg down</b> this week, right on trend. Hit your protein floor today: <b>155&nbsp;g</b>.</p>
        <div class="coach-link" data-action="nav:review">See the 3 changes →</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span class="section-label" style="margin:0">TODAY'S SESSION</span>
          <span style="font-size:11px;color:var(--muted-2)">Program · Week 3 of 4</span></div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-.4px">Push A</div>
        <div style="font-size:13px;color:var(--muted);margin:3px 0 14px">6 exercises · ~52 min · Chest · Shoulders · Triceps</div>
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
     Workout (1c) + swap (2a)
     ========================================================= */
  function screenWorkout() {
    const activeIdx = state.sets.findIndex((s) => !s.done);
    const rows = state.sets.map((s, i) => {
      const cls = s.done ? 'done' : (i === activeIdx ? 'active' : '');
      const numColor = s.done ? 'var(--green)' : (i === activeIdx ? 'var(--text)' : 'var(--dim)');
      const repsColor = s.done ? 'var(--text)' : 'var(--dim)';
      return `<div class="set-grid set-row ${cls}">
        <span class="set-n" style="color:${numColor}">${i + 1}</span>
        <span class="set-prev">${esc(s.prev)}</span><span class="set-kg">${s.kg}</span>
        <span class="set-reps" style="color:${repsColor}">${s.done ? s.reps : '·'}</span>
        <div class="set-check-wrap"><button class="set-check" data-action="log-set:${i}" aria-label="Log set ${i + 1}">✓</button></div>
      </div>`;
    }).join('');
    const swapNote = state.swapped ? `<div class="swap-note"><span class="tick">✓</span>Swapped from ${esc(state.swappedFrom)} · weight re-estimated by Coach</div>` : '';
    const done = state.sets.filter((s) => s.done).length;
    return `<div class="workout">
      <div class="sess-top">
        <button class="icon-btn" data-action="nav:today" aria-label="End workout">✕</button>
        <div class="sess-mid"><div class="sess-kicker">PUSH A · 2 / 6</div><div class="sess-name">${esc(state.exName)}</div></div>
        <div class="sess-elapsed" style="text-align:right"><div class="l">ELAPSED</div><div class="v">24:18</div></div>
      </div>
      <div class="progress-dots"><i class="done"></i><i class="cur"></i><i></i><i></i><i></i><i></i></div>
      <div class="workout-scroll"><div class="pad" style="padding-top:0">
        <div class="ex-head"><div class="ex-head-row">
          <div style="flex:1"><div class="ex-name">${esc(state.exName)}</div><div class="ex-scheme">Prescribed&nbsp;<b>${esc(state.exScheme)}</b></div></div>
          <button class="swap-btn" data-action="open-swap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="17,3 21,7 17,11"/><line x1="21" y1="7" x2="7" y2="7"/><polyline points="7,21 3,17 7,13"/><line x1="3" y1="17" x2="17" y2="17"/></svg>Swap</button>
        </div>${swapNote}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="font-size:13px;color:var(--muted)">${done}/4 sets logged</span>
          ${state.progressed ? '<span class="progressed">↑ Progressed</span>' : ''}</div>
        <div class="set-table">
          <div class="set-grid head"><span>SET</span><span>PREV</span><span class="c">KG</span><span class="c">REPS</span><span></span></div>
          ${rows}
        </div>
        ${HINT("Machine taken or missing? Tap <b>Swap</b> — I'll suggest same-muscle options and re-estimate your working weight so progression keeps counting.")}
      </div></div>
      <div id="restRegion">${restRegion()}</div>
      ${state.swapOpen ? swapSheet() : ''}
    </div>`;
  }

  function restRegion() {
    if (state.sets.every((s) => s.done)) {
      return `<div class="rest" style="background:#0d0d10">
        <button class="btn btn-primary" data-action="nav:report">Finish session →</button></div>`;
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
     Session report (4a)
     ========================================================= */
  function screenReport() {
    const rowsHtml = [
      ['Bench Press', '4×6–8 @ 64 → <b style="color:var(--text-2)">4×8 @ 64</b>', 'Exceeded ↑', 'var(--green)', 'rgba(48,209,88,.14)'],
      ['Overhead Press', '4×6–8 @ 40 → <b style="color:var(--text-2)">4×7 @ 40</b>', 'Hit ✓', 'var(--indigo-3)', 'rgba(94,92,230,.16)'],
      ['Lateral Raise', '3×12–15 @ 10 → <b style="color:var(--text-2)">3×10 @ 10</b>', 'Under ↓', 'var(--orange)', 'rgba(255,159,10,.14)'],
    ].map(([n, d, tag, c, bg]) => `<div class="srow"><div><div class="n">${n}</div><div class="sub">${d}</div></div>
      <span style="font-size:11px;font-weight:700;color:${c};background:${bg};padding:5px 9px;border-radius:999px">${tag}</span></div>`).join('');
    return `<div class="route">
      <div class="topbar"><span style="width:34px"></span><span class="grow" style="text-align:center;font-size:16px;font-weight:700">Session complete</span>
        <button class="sheet-cancel" data-action="finish-report" style="width:auto">Done</button></div>
      <div class="view" style="overflow:visible"><div class="pad" style="padding-top:8px">
        <div style="text-align:center;padding:14px 0 18px">
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(48,209,88,.15);border:1.5px solid rgba(48,209,88,.4);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;color:var(--green);font-weight:800">✓</div>
          <div style="font-size:24px;font-weight:700;letter-spacing:-.4px">Push A · done</div>
          <div style="font-size:13px;color:var(--muted-2);margin-top:3px">51 min · 18 sets · 4,860 kg total volume</div></div>
        <div style="display:flex;gap:10px;margin-bottom:18px">
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--green)">+8%</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">volume vs last</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800">2 ↑</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">exceeded target</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:13px;text-align:center"><div style="font-size:20px;font-weight:800;color:var(--orange)">12</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">day streak</div></div></div>
        <div class="section-label">PRESCRIBED vs PERFORMED</div>
        <div class="group">${rowsHtml}</div>
        <div class="coach"><div class="coach-head">${AB}<span class="coach-title">Coach note</span></div>
          <p>Bench exceeded target <b>two weeks running</b> — I'll move it to 66 kg Thursday. Lateral raises fell short; try dropping to 8 kg and owning the top of the range.</p></div>
      </div></div></div>`;
  }

  /* =========================================================
     Food day log (3b)
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

  /* Food · AI photo estimate (3a) */
  function screenFoodphoto() {
    const p = PORTIONS[state.portionIdx];
    const kcal = Math.round(620 * p.mult / 10) * 10;
    const protein = Math.round(34 * p.mult);
    const kLo = Math.round(kcal * 0.87 / 10) * 10, kHi = Math.round(kcal * 1.13 / 10) * 10;
    const pLo = Math.round(protein * 0.9), pHi = Math.round(protein * 1.12);
    return `<div class="route">
      <div class="topbar"><button class="sheet-cancel" data-action="nav:food" style="width:auto;color:var(--text-2)">Cancel</button>
        <span class="grow" style="text-align:center;font-size:16px;font-weight:700">AI estimate</span>
        <button class="sheet-cancel" data-action="portion:0" style="width:auto;color:var(--indigo-3)">Retake</button></div>
      <div class="view" style="overflow-y:auto">
        <div class="fp-photo">
          <span style="font:12px ui-monospace,Menlo,monospace;color:var(--dim);letter-spacing:1.5px">[ meal photo ]</span>
          <div style="position:absolute;top:14px;left:16px;display:flex;align-items:center;gap:7px;background:rgba(10,10,11,.7);backdrop-filter:blur(10px);border:1px solid rgba(148,140,255,.4);border-radius:999px;padding:6px 11px">
            <div class="ai-badge" style="width:18px;height:18px;font-size:8px">AI</div><span style="font-size:12px;font-weight:600;color:#d8d6ff">Detected · 92% confident</span></div>
        </div>
        <div style="padding:18px 20px 28px">
          <div class="section-label" style="margin-bottom:6px">I THINK THIS IS</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:-.3px">Nasi + ayam goreng + tempe</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:12px">
            <span style="font-size:13px;color:var(--muted)">Portion</span>
            <div class="stepper"><button data-action="portion:-1">−</button><span style="font-size:14px;font-weight:600;min-width:104px;text-align:center">${esc(p.label)}</span><button data-action="portion:1">+</button></div></div>
          <div style="display:flex;gap:12px;margin:18px 0 6px">
            <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Calories</div><div style="font-size:26px;font-weight:800;margin-top:5px">≈ ${kcal}</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">range ${kLo}–${kHi} kcal</div></div>
            <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Protein</div><div style="font-size:26px;font-weight:800;margin-top:5px;color:var(--orange)">≈ ${protein}<span style="font-size:15px;color:var(--muted-2)">g</span></div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">range ${pLo}–${pHi} g</div></div></div>
          ${HINT('These are <b style="color:var(--text-2)">estimates, not exact</b> — tap ± to correct the portion. I&rsquo;ll remember this meal so it&rsquo;s 1-tap next time.')}
          <button class="btn btn-primary" data-action="log-photo" style="margin:8px 0 10px">Looks right — log it</button>
          <button class="btn btn-ghost" data-action="nav:food">Edit details</button>
        </div>
      </div></div>`;
  }

  /* =========================================================
     Body (4b) + progress-photo compare (4c)
     ========================================================= */
  function screenBody() {
    return `<div class="route">
      <div class="pad">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 18px">
          <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">Body</div><span style="font-size:13px;color:var(--muted-2)">Wed · 16 Jul</span></div>
        <div class="card" style="border-radius:20px;margin-bottom:14px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
            <div><div style="font-size:12px;color:var(--muted-2);font-weight:600">Weight · today</div><div style="font-size:34px;font-weight:800;letter-spacing:-1px;margin-top:2px">74.2<span style="font-size:16px;color:var(--muted-2)">kg</span></div></div>
            <div style="text-align:right"><div style="font-size:15px;font-weight:700;color:var(--green)">−1.2 kg</div><div style="font-size:11px;color:var(--muted-2)">this week</div></div></div>
          <svg width="100%" height="86" viewBox="0 0 320 86" preserveAspectRatio="none"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30d158" stop-opacity=".35"/><stop offset="1" stop-color="#30d158" stop-opacity="0"/></linearGradient></defs>
            <polygon points="0,28 32,34 64,30 96,42 128,38 160,48 192,44 224,56 256,52 288,64 320,60 320,86 0,86" fill="url(#wg)"/>
            <polyline points="0,28 32,34 64,30 96,42 128,38 160,48 192,44 224,56 256,52 288,64 320,60" fill="none" stroke="#30d158" stroke-width="2.5"/></svg>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-top:6px"><span>35 days ago</span><span>today</span></div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Waist / Hip</div><div style="font-size:20px;font-weight:800;margin-top:5px">82 / 96</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">WHR <b style="color:var(--text-2)">0.85</b></div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:15px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Body fat</div><div style="font-size:20px;font-weight:800;margin-top:5px">≈ 16<span style="font-size:13px;color:var(--muted-2)">%</span></div><div style="font-size:11px;color:var(--muted-2);margin-top:2px">scale estimate</div></div></div>
        <div style="display:flex;align-items:center;gap:10px;background:rgba(94,92,230,.1);border:1px solid rgba(148,140,255,.28);border-radius:14px;padding:13px;margin-bottom:16px">${AB}<span style="font-size:13px;line-height:1.4;color:#d8d6ff">Weekly tape due tomorrow — takes 20 seconds and sharpens my trend read.</span></div>
        <button class="btn btn-primary" data-action="log-weight" style="margin-bottom:10px">Log today's weigh-in</button>
        <button class="btn btn-ghost" data-action="nav:photos">Compare progress photos</button>
      </div></div>`;
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
     Daily check-in (4d)
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
      <div style="flex:1;display:flex;flex-direction:column;padding:16px 24px 22px">
        <div style="font-size:13px;color:var(--muted-2);margin-bottom:26px">Ten seconds. It tunes today's plan.</div>
        <div style="margin-bottom:26px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><span style="font-size:16px;font-weight:600">Sleep</span><span style="font-size:20px;font-weight:800">${ci.sleep.toFixed(1)}<span style="font-size:13px;color:var(--muted-2)">h</span></span></div>
          <div style="height:8px;border-radius:999px;background:rgba(255,255,255,.08);position:relative"><div style="width:${sleepPct}%;height:100%;border-radius:999px;background:var(--indigo)"></div><div style="position:absolute;top:50%;left:${sleepPct}%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div></div></div>
        <div style="margin-bottom:24px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Energy</div>${rating('energy', ci.energy, 'var(--green)', 'var(--green-ink)')}</div>
        <div style="margin-bottom:24px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Soreness</div>${rating('soreness', ci.soreness, 'var(--orange)', '#2a1800')}</div>
        ${HINT(`Soreness at ${ci.soreness} ${ci.soreness >= 4 ? 'two days running — I may pull back Thursday&rsquo;s volume.' : '— recovery looks fine for Thursday.'}`)}
        <div style="flex:1"></div>
        <button class="btn btn-primary" data-action="save-checkin" style="padding:17px">Save check-in</button>
      </div></div>`;
  }

  /* =========================================================
     Reminders (5a) + Settings (5b)
     ========================================================= */
  function tgl(on, action) {
    return `<button class="tgl ${on ? 'on' : 'off'}" data-action="${action}" aria-pressed="${on}"><i></i></button>`;
  }
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
  function screenSettings() {
    return `<div class="route">
      <div class="topbar"><button class="icon-btn" data-action="nav:today">‹</button><span class="t">Settings</span></div>
      <div class="pad" style="padding-top:0">
        <div class="srow" data-action="toast:Profile · coming soon" style="background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px;cursor:pointer">
          <div style="display:flex;align-items:center;gap:14px"><div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#3a3a3c,#2a2a2c);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">M</div>
            <div><div style="font-size:17px;font-weight:700">Munir Sama</div><div class="sub">munir@email.com · joined May 2026</div></div></div><span style="color:var(--dim);font-size:20px">›</span></div>
        <div class="coach" style="margin-bottom:18px;padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:15px;font-weight:700;color:#fff">Gaspol Premium</span><span style="font-size:9px;font-weight:800;letter-spacing:.5px;color:#fff;background:rgba(255,255,255,.2);padding:3px 7px;border-radius:5px">ACTIVE</span></div>
          <div style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.45;margin-bottom:12px">Auto-progression, weekly AI review, food-photo AI, progress photos &amp; full history.</div>
          <div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:22px;font-weight:800;color:#fff">Rp 39k</span><span style="font-size:13px;color:rgba(255,255,255,.6)">/ month · renews 1 Aug</span></div></div>
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
        <button class="btn btn-ghost" data-action="toast:Signed out">Sign out</button>
        <button style="width:100%;background:transparent;color:var(--red,#ff453a);border:none;font-size:14px;font-weight:600;padding:12px;cursor:pointer;margin-top:6px" data-action="toast:Account deletion — full export first">Delete account</button>
      </div></div>`;
  }

  /* =========================================================
     Onboarding (3c intake → 3d plan preview)
     ========================================================= */
  function screenOnboarding() {
    if (state.obStep === 0) {
      const opts = GOALS.map(([k, name, sub]) => {
        const sel = state.obGoal === k;
        return `<button class="ob-opt ${sel ? 'sel' : ''}" data-action="ob-goal:${k}">
          <div style="flex:1"><div style="font-size:17px;font-weight:700">${name}</div><div style="font-size:13px;color:var(--muted);margin-top:2px">${sub}</div></div>
          <div class="radio">${sel ? '✓' : ''}</div></button>`;
      }).join('');
      return `<div class="route">
        <div style="display:flex;align-items:center;gap:12px;padding:8px 20px 16px">
          <button class="icon-btn" data-action="skip-onboarding" aria-label="Skip">‹</button>
          <div style="flex:1;height:5px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden"><div style="width:50%;height:100%;background:var(--green);border-radius:999px"></div></div>
          <span style="font-size:12px;font-weight:600;color:var(--muted-2)">4 / 8</span></div>
        <div style="flex:1;display:flex;flex-direction:column;padding:14px 24px 22px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:var(--indigo-3);margin-bottom:10px">YOUR GOAL</div>
          <div style="font-size:28px;font-weight:700;letter-spacing:-.6px;line-height:1.15">What do you want your first phase to do?</div>
          <div style="display:flex;flex-direction:column;gap:12px;margin-top:26px">${opts}</div>
          ${HINT("This shapes your calories, macros and progression pace. You can switch phases anytime — I'll adjust.")}
          <div style="flex:1"></div>
          <button class="btn btn-primary" data-action="ob-next" style="padding:17px">Continue</button>
        </div></div>`;
    }
    // step 1 — generated plan preview (3d)
    const goalName = GOALS.find((g) => g[0] === state.obGoal)[1];
    const week = [['Mon', 'Push A', '~52 min'], ['Tue', 'Pull A', '~50 min'], ['Wed', 'Legs A', '~55 min'], ['Thu', 'Rest / mobility', '']]
      .map(([d, s, t], i, arr) => `<div class="srow"${i === arr.length - 1 ? ' style="border-bottom:none"' : ''}><span style="font-size:14px;font-weight:600;color:var(--muted-2);width:44px">${d}</span><span style="font-size:14px;font-weight:600;flex:1;${!t ? 'color:var(--muted)' : ''}">${s}</span>${t ? `<span style="font-size:12px;color:var(--muted-2)">${t}</span>` : ''}</div>`).join('');
    return `<div class="route">
      <div class="pad" style="padding-top:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="ai-badge" style="width:30px;height:30px;font-size:11px">AI</div><span style="font-size:13px;font-weight:600;color:var(--indigo-3)">Coach built your plan</span></div>
        <div style="font-size:29px;font-weight:800;letter-spacing:-.8px;line-height:1.1;margin-bottom:16px">Here's your first 4 weeks, Munir.</div>
        <div style="background:linear-gradient(150deg,#3a2a7a,#211a4f);border:1px solid rgba(148,140,255,.3);border-radius:20px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#c8c5ff">PHASE 1</div>
          <div style="font-size:22px;font-weight:700;color:#fff;margin-top:3px">${goalName} · 4 weeks</div>
          <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">Push / Pull / Legs · 5 days a week</div></div>
        <div style="display:flex;gap:12px;margin-bottom:14px">
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Daily target</div><div style="font-size:20px;font-weight:800;margin-top:5px">2,150</div><div style="font-size:11px;color:var(--muted-2)">kcal</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Protein</div><div style="font-size:20px;font-weight:800;margin-top:5px;color:var(--orange)">155<span style="font-size:13px;color:var(--muted-2)">g</span></div><div style="font-size:11px;color:var(--muted-2)">floor</div></div>
          <div style="flex:1;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px"><div style="font-size:12px;color:var(--muted-2);font-weight:600">Est. trend</div><div style="font-size:20px;font-weight:800;margin-top:5px;color:var(--green)">−0.5</div><div style="font-size:11px;color:var(--muted-2)">kg / wk</div></div></div>
        <div class="section-label">YOUR WEEK</div>
        <div class="group">${week}</div>
        ${HINT("Starting weights estimated from your intake. Log a few sets and I'll dial them in — first weekly review recalibrates everything.")}
        <button class="btn btn-primary" data-action="ob-start" style="margin:6px 0 10px">Start with Push A</button>
        <button style="width:100%;background:transparent;color:var(--indigo-3);border:none;font-size:15px;font-weight:600;padding:8px;cursor:pointer" data-action="ob-back">Adjust the plan</button>
      </div></div>`;
  }

  /* =========================================================
     Weekly review (1e)
     ========================================================= */
  function screenReview() {
    const swapChange = state.swapped ? `<div class="change"><div class="dot" style="background:#8f8bff"></div>
      <div><div class="t">Bench Press → ${esc(state.exName)}</div><div class="d">Swapped mid-session — Coach re-estimated the load so progression still counts.</div></div></div>` : '';
    return `<div>
      <div class="review-head"><button class="icon-btn" data-action="nav:today" style="font-size:18px">‹</button>
        <div><div class="sess-kicker">WEEKLY REVIEW</div><div class="sess-name">13–19 Jul · Week 3</div></div></div>
      <div class="pad" style="padding-top:0">
        <div class="review-verdict"><div class="ai-badge lg">AI</div><div><div class="l">COACH</div><div class="v">Strong week, Munir.</div></div></div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="k">Sessions</div><div class="n">6<span style="font-size:14px;color:var(--muted-2)">/6</span></div><div class="s" style="color:var(--green)">100% adherence</div></div>
          <div class="stat-cell"><div class="k">Volume</div><div class="n" style="color:var(--green)">+8%</div><div class="s">vs last week</div></div>
          <div class="stat-cell"><div class="k">Protein avg</div><div class="n" style="color:var(--orange)">149<span style="font-size:14px;color:var(--muted-2)">g</span></div><div class="s">under 155 g floor</div></div>
          <div class="stat-cell"><div class="k">Weight</div><div class="n" style="color:var(--green)">−1.1<span style="font-size:14px;color:var(--muted-2)">kg</span></div><div class="s">on trend</div></div></div>
        <div class="section-label">CHANGES I MADE</div>
        ${swapChange}
        <div class="change"><div class="dot" style="background:var(--green)"></div><div><div class="t">Thursday bench → 64 kg <span style="color:var(--green);font-weight:600">(+2.5)</span></div><div class="d">Top sets cleared 8 reps two weeks running.</div></div></div>
        <div class="change"><div class="dot" style="background:var(--orange)"></div><div><div class="t">Calories → 2,100 <span style="color:var(--orange);font-weight:600">(−50)</span></div><div class="d">Weight loss slowed to 0.4%/wk — nudging the deficit.</div></div></div>
        <div class="change" style="margin-bottom:16px"><div class="dot" style="background:#64d2ff"></div><div><div class="t">Protein reminder at 15:00</div><div class="d">You landed under the floor 3 days this week.</div></div></div>
        <div class="coach"><div class="coach-head">${AB}<span class="coach-title">Coach note</span></div>
          <p>Adherence is carrying this cut — every session in, weight bang on trend. The one gap is protein: three days under 155&nbsp;g. Fix that and next week is another clean progression. <b>Keep going.</b></p></div>
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
      default: return screenToday();
    }
  }
  function renderTabbar() {
    const bar = $('#tabbar');
    if (!TAB_SCREENS.includes(state.tab)) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.innerHTML = TABS.map(([key, label]) => {
      const active = state.tab === key || (key === 'workout' && false);
      return `<button class="tab ${active ? 'active' : ''}" data-action="nav:${key}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[key]}</svg><span>${label}</span></button>`;
    }).join('');
  }
  function render() {
    $('#view').innerHTML = currentScreen();
    renderTabbar();
    if (state.tab === 'photos') wireCompare();
  }
  function paintRest() { const r = $('#restRegion'); if (r) r.innerHTML = restRegion(); }

  /* ---- Progress-photo compare (drag) ------------------------ */
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
    const s = state.sets[i];
    if (!s || s.done) return;
    s.done = true; s.reps = s.reps || 8; state.rest = 90; state.restTotal = 90;
    render();
    if (state.sets.every((x) => x.done)) showToast('All sets logged — finish when ready');
  }
  function chooseAlt(idx) {
    const a = ALTS[idx]; if (!a) return;
    state.swappedFrom = state.exName; state.exName = a.name; state.exScheme = a.scheme;
    state.swapped = true; state.swapOpen = false; state.filter = 'all';
    render(); showToast(`Swapped to ${a.name} · weight re-estimated`);
  }
  function addPreset(k) {
    const p = PRESETS[k]; if (!p) return;
    state.meals.push({ name: p.name, sub: `${nowTime()} · ${p.protein} g protein`, kcal: p.kcal, protein: p.protein });
    render(); showToast(`Added · ${k} (${p.kcal} kcal)`);
  }
  function logPhoto() {
    const p = PORTIONS[state.portionIdx];
    const kcal = Math.round(620 * p.mult / 10) * 10, protein = Math.round(34 * p.mult);
    state.meals.push({ name: 'Nasi + ayam goreng + tempe', sub: `${nowTime()} · ${protein} g protein`, kcal, protein, ai: true });
    state.tab = 'food'; state.portionIdx = 2; render(); showToast(`Logged · ${kcal} kcal (AI estimate)`);
  }

  const ACTIONS = {
    'nav': (a) => { state.tab = a; render(); $('#view').scrollTop = 0; },
    'log-set': (a) => logSet(Number(a)),
    'skip-rest': () => { state.rest = 0; paintRest(); },
    'open-swap': () => { state.swapOpen = true; render(); },
    'close-swap': () => { state.swapOpen = false; render(); },
    'filter': (a) => { state.filter = a; render(); },
    'choose-alt': (a) => chooseAlt(Number(a)),
    'finish-report': () => {
      // reset the session so the loop can replay
      state.sets.forEach((s) => { s.done = false; }); state.rest = 0;
      state.swapped = false; state.swappedFrom = null; state.exName = 'Bench Press'; state.exScheme = '4 × 6–8 @ 64 kg';
      state.tab = 'today'; render(); showToast('Session saved · streak 12 days');
    },
    'add-preset': (a) => addPreset(a),
    'log-photo': () => logPhoto(),
    'portion': (a) => { const d = Number(a); state.portionIdx = d === 0 ? 2 : Math.max(0, Math.min(PORTIONS.length - 1, state.portionIdx + d)); render(); },
    'photoview': (a) => { state.photoView = a; render(); },
    'rate': (a) => { const [kind, n] = a.split(':'); state.checkin[kind] = Number(n); render(); },
    'save-checkin': () => { state.tab = 'today'; render(); showToast('Check-in saved · thanks, Munir'); },
    'toggle': (a) => { state.reminders[a] = !state.reminders[a]; render(); },
    'log-weight': () => showToast('Weigh-in saved · 74.2 kg'),
    'toast': (a) => showToast(a),
    // onboarding
    'ob-goal': (a) => { state.obGoal = a; render(); },
    'ob-next': () => { state.obStep = 1; render(); $('#view').scrollTop = 0; },
    'ob-back': () => { state.obStep = 0; render(); },
    'ob-start': () => { finishOnboarding(); state.tab = 'workout'; render(); },
    'skip-onboarding': () => { finishOnboarding(); state.tab = 'today'; render(); },
    'replay-onboarding': () => { state.obStep = 0; state.tab = 'onboarding'; render(); $('#view').scrollTop = 0; },
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
    if (state.rest > 0 && !state.sets.every((s) => s.done)) {
      state.rest -= 1;
      if (state.tab === 'workout') paintRest();
    }
  }, 1000);

  /* ---- Boot ------------------------------------------------- */
  try { if (!localStorage.getItem('gaspol_onboarded')) state.tab = 'onboarding'; } catch (e) { /* ignore */ }
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
