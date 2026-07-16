/* ============================================================
   Gaspol — app logic
   A faithful implementation of Gaspol.dc.html: dark, AI-first
   mobile coach. Vanilla JS state + render engine (no build step),
   installable PWA. Persona P1 "Munir" · Cut · Week 3.
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Static program / persona data ------------------ */
  const ALTS = [
    { name: 'Machine Chest Press', equip: 'Machine', cat: 'machine', match: 96, scheme: '4 × 8–10 @ 50 kg', best: true, note: 'Closest match to your bench strength curve.' },
    { name: 'Dumbbell Bench Press', equip: 'Dumbbells', cat: 'dumbbell', match: 92, scheme: '4 × 8–10 @ 28 kg', note: 'More stabiliser work — log per dumbbell.' },
    { name: 'Incline Machine Press', equip: 'Machine', cat: 'machine', match: 85, scheme: '4 × 8–10 @ 40 kg', note: 'Shifts load onto upper chest.' },
    { name: 'Weighted Push-Up', equip: 'Bodyweight', cat: 'body', match: 78, scheme: '4 × 12–15 reps', note: 'No kit needed — add a plate on your back.' },
  ];
  const TAG_COLOR = { machine: '#8f8bff', dumbbell: '#ff9f0a', body: '#30d158' };
  const FILTERS = [['all', 'All'], ['machine', 'Machine'], ['dumbbell', 'Dumbbell'], ['body', 'Bodyweight']];

  const WEIGHT_HISTORY = [72.4, 72.1, 71.8, 71.9, 71.3, 71.0, 70.8, 70.9, 70.4, 70.1];

  /* ---------- App state -------------------------------------- */
  const state = {
    tab: 'today',                                   // today | workout | food | body | review
    // workout / set logging (ported from the design Component)
    exName: 'Bench Press',
    exScheme: '4 × 6–8 @ 64 kg',
    progressed: true,
    sets: [
      { kg: 64, reps: 8, prev: '62×8', done: false },
      { kg: 64, reps: 8, prev: '62×8', done: false },
      { kg: 64, reps: 8, prev: '62×7', done: false },
      { kg: 64, reps: 8, prev: '62×7', done: false },
    ],
    rest: 0,               // seconds remaining (0 = idle)
    restTotal: 90,
    // swap flow
    swapOpen: false,
    filter: 'all',
    swapped: false,
    swappedFrom: null,
    // nutrition
    kcalTarget: 2150,
    proteinTarget: 155,
    meals: [
      { emoji: '🍳', name: 'Oatmeal + eggs + whey', sub: 'Breakfast · 07:20', kcal: 520, protein: 42 },
      { emoji: '🍗', name: 'Nasi + dada ayam + tempe', sub: 'Lunch · 12:40', kcal: 640, protein: 46 },
      { emoji: '🥤', name: 'Whey shake', sub: 'Post-workout · 17:30', kcal: 160, protein: 30 },
    ],
    toast: null,
  };

  /* ---------- Small helpers ---------------------------------- */
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);

  /* ---------- Icons (from the design) ------------------------ */
  const ICONS = {
    today: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="16" y1="3" x2="16" y2="6"/>',
    workout: '<rect x="2.5" y="9" width="3.5" height="6" rx="1.2"/><rect x="18" y="9" width="3.5" height="6" rx="1.2"/><line x1="6" y1="12" x2="18" y2="12"/>',
    food: '<circle cx="10.5" cy="12" r="7.5"/><line x1="20" y1="4" x2="20" y2="20"/>',
    body: '<circle cx="12" cy="7" r="3.2"/><rect x="7" y="12.5" width="10" height="8.5" rx="5"/>',
    review: '<polyline points="3,16 9,11 13,14 21,5"/><line x1="3" y1="20" x2="21" y2="20"/>',
  };
  const TABS = [
    ['today', 'Today'], ['workout', 'Workout'], ['food', 'Food'], ['body', 'Body'], ['review', 'Progress'],
  ];

  /* =========================================================
     SCREENS
     ========================================================= */

  function screenToday() {
    const kcal = sum(state.meals, 'kcal');
    const protein = sum(state.meals, 'protein');
    const kcalPct = Math.round((kcal / state.kcalTarget) * 100);
    const proteinPct = Math.round((protein / state.proteinTarget) * 100);
    const kcalDeg = Math.min(360, (kcal / state.kcalTarget) * 360);
    const proteinDeg = Math.min(360, (protein / state.proteinTarget) * 360);

    return `<div class="pad">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0 22px">
        <div>
          <div class="h-day">Wed · 16 Jul</div>
          <div class="h-greet">Good morning, Munir</div>
        </div>
        <div class="pill pill-phase">Cut · Wk 3</div>
      </div>

      <div class="coach" style="margin-bottom:16px">
        <div class="coach-head">
          <div class="ai-badge">AI</div>
          <span class="coach-title">Coach</span>
          <span class="dot-live"></span>
          <span style="font-size:11px;color:rgba(255,255,255,.5);margin-left:auto">Updated just now</span>
        </div>
        <p>Bench cleared its top set two weeks running — I moved <b>Thursday to 64&nbsp;kg</b>. You're <b>1.2&nbsp;kg down</b> this week, right on trend. Hit your protein floor today: <b>155&nbsp;g</b>.</p>
        <div class="coach-link" data-action="nav:review">See the 3 changes →</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span class="section-label" style="margin:0">TODAY'S SESSION</span>
          <span style="font-size:11px;color:var(--muted-2)">Program · Week 3 of 4</span>
        </div>
        <div style="font-size:24px;font-weight:700;letter-spacing:-.4px">Push A</div>
        <div style="font-size:13px;color:var(--muted);margin:3px 0 14px">6 exercises · ~52 min · Chest · Shoulders · Triceps</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">
          <span class="chip">Bench · 64 kg</span>
          <span class="chip">OHP</span>
          <span class="chip">Incline DB</span>
          <span class="chip">+3 more</span>
        </div>
        <button class="btn btn-primary" data-action="nav:workout">Start workout</button>
      </div>

      <div class="stat-row">
        <div class="ring-card">
          <h4>Calories</h4>
          <div class="ring-wrap">
            <div class="ring" style="background:conic-gradient(var(--green) ${kcalDeg}deg,rgba(255,255,255,.08) ${kcalDeg}deg)"><span>${kcalPct}%</span></div>
            <div><div class="ring-val">${kcal.toLocaleString()}</div><div class="ring-sub">of ${state.kcalTarget.toLocaleString()}</div></div>
          </div>
        </div>
        <div class="ring-card">
          <h4>Protein</h4>
          <div class="ring-wrap">
            <div class="ring" style="background:conic-gradient(var(--orange) ${proteinDeg}deg,rgba(255,255,255,.08) ${proteinDeg}deg)"><span>${proteinPct}%</span></div>
            <div><div class="ring-val">${protein}<span style="font-size:12px;color:var(--muted-2)">g</span></div><div class="ring-sub">of ${state.proteinTarget} g</div></div>
          </div>
        </div>
      </div>

      <div class="quick-row">
        <div class="quick" data-action="nav:body">Log weight</div>
        <div class="quick" data-action="nav:food">Log meal</div>
        <div class="quick" data-action="toast:Check-in saved · 10s">Check-in</div>
      </div>
    </div>`;
  }

  function screenWorkout() {
    const activeIdx = state.sets.findIndex((s) => !s.done);
    const rows = state.sets.map((s, i) => {
      const cls = s.done ? 'done' : (i === activeIdx ? 'active' : '');
      const numColor = s.done ? 'var(--green)' : (i === activeIdx ? 'var(--text)' : 'var(--dim)');
      const reps = s.done ? s.reps : '·';
      const repsColor = s.done ? 'var(--text)' : 'var(--dim)';
      return `<div class="set-grid set-row ${cls}">
        <span class="set-n" style="color:${numColor}">${i + 1}</span>
        <span class="set-prev">${esc(s.prev)}</span>
        <span class="set-kg">${s.kg}</span>
        <span class="set-reps" style="color:${repsColor}">${reps}</span>
        <div class="set-check-wrap"><button class="set-check" data-action="log-set:${i}" aria-label="Log set ${i + 1}">✓</button></div>
      </div>`;
    }).join('');

    const swapNote = state.swapped ? `<div class="swap-note">
        <span class="tick">✓</span>Swapped from ${esc(state.swappedFrom)} · weight re-estimated by Coach
      </div>` : '';

    const done = state.sets.filter((s) => s.done).length;

    return `<div class="workout">
      <div class="sess-top">
        <button class="icon-btn" data-action="nav:today" aria-label="End workout">✕</button>
        <div class="sess-mid">
          <div class="sess-kicker">PUSH A · 2 / 6</div>
          <div class="sess-name">${esc(state.exName)}</div>
        </div>
        <div class="sess-elapsed" style="text-align:right"><div class="l">ELAPSED</div><div class="v">24:18</div></div>
      </div>

      <div class="progress-dots">
        <i class="done"></i><i class="cur"></i><i></i><i></i><i></i><i></i>
      </div>

      <div class="workout-scroll"><div class="pad" style="padding-top:0">
        <div class="ex-head">
          <div class="ex-head-row">
            <div style="flex:1">
              <div class="ex-name">${esc(state.exName)}</div>
              <div class="ex-scheme">Prescribed&nbsp;<b>${esc(state.exScheme)}</b></div>
            </div>
            <button class="swap-btn" data-action="open-swap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="17,3 21,7 17,11"/><line x1="21" y1="7" x2="7" y2="7"/><polyline points="7,21 3,17 7,13"/><line x1="3" y1="17" x2="17" y2="17"/></svg>Swap
            </button>
          </div>
          ${swapNote}
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <span style="font-size:13px;color:var(--muted)">${done}/4 sets logged</span>
          ${state.progressed ? '<span class="progressed">↑ Progressed</span>' : ''}
        </div>

        <div class="set-table">
          <div class="set-grid head"><span>SET</span><span>PREV</span><span class="c">KG</span><span class="c">REPS</span><span></span></div>
          ${rows}
        </div>

        <div class="hint"><span class="b"></span><span>Machine taken or missing? Tap <b>Swap</b> — I'll suggest same-muscle options and re-estimate your working weight so progression keeps counting.</span></div>
      </div></div>

      <div id="restRegion">${restRegion()}</div>

      ${state.swapOpen ? swapSheet() : ''}
    </div>`;
  }

  function restRegion() {
    if (state.rest > 0) {
      const pct = Math.round((state.rest / state.restTotal) * 100);
      return `<div class="rest">
        <div class="rest-top">
          <span class="l">REST</span>
          <span class="t">${fmt(state.rest)}</span>
          <button class="rest-skip" data-action="skip-rest">Skip</button>
        </div>
        <div class="rest-track"><div class="rest-fill" style="width:${pct}%"></div></div>
      </div>`;
    }
    return `<div class="rest-idle"><span class="b"></span><span>Log each set — I start your rest timer automatically.</span></div>`;
  }

  function swapSheet() {
    const alts = (state.filter === 'all' ? ALTS : ALTS.filter((a) => a.cat === state.filter));
    const cards = alts.map((a) => {
      const matchColor = a.match >= 90 ? 'var(--green)' : 'var(--muted)';
      const bestBadge = a.best ? '<span class="badge-best">BEST MATCH</span>' : '';
      const realIdx = ALTS.indexOf(a);
      return `<button class="alt ${a.best ? 'best' : ''}" data-action="choose-alt:${realIdx}">
        <div class="alt-top">
          <span class="alt-name">${esc(a.name)}</span>${bestBadge}
          <span class="alt-match" style="color:${matchColor}">${a.match}% match</span>
        </div>
        <div class="alt-meta">
          <span class="alt-equip" style="color:${TAG_COLOR[a.cat]}">${esc(a.equip)}</span>
          <span class="alt-scheme">${esc(a.scheme)}</span>
        </div>
        <div class="alt-note">${esc(a.note)}</div>
      </button>`;
    }).join('');

    const chips = FILTERS.map(([k, label]) =>
      `<button class="fchip ${state.filter === k ? 'active' : ''}" data-action="filter:${k}">${label}</button>`
    ).join('');

    return `<div class="sheet-scrim">
      <div class="sheet-bg" data-action="close-swap"></div>
      <div class="sheet">
        <div class="sheet-grab"></div>
        <div class="sheet-title-row">
          <div class="sheet-title">Swap exercise</div>
          <button class="sheet-cancel" data-action="close-swap">Cancel</button>
        </div>
        <div class="sheet-sub">Same muscle group · chest, front delts, triceps</div>
        <div class="sheet-ai">
          <div class="ai-badge">AI</div>
          <span>Bench bay busy? Here's what hits the same muscles with what's free — ranked for you.</span>
        </div>
        <div class="chips">${chips}</div>
        <div class="alts">${cards || '<div class="alt-note" style="padding:8px 2px">No alternatives for this filter.</div>'}</div>
      </div>
    </div>`;
  }

  function screenFood() {
    const kcal = sum(state.meals, 'kcal');
    const protein = sum(state.meals, 'protein');
    const carbs = 168, fat = 44; // illustrative
    const bar = (val, target, color) => {
      const pct = Math.min(100, Math.round((val / target) * 100));
      return `<div class="macro-track"><div class="macro-fill" style="width:${pct}%;background:${color}"></div></div>`;
    };
    const meals = state.meals.map((m) => `<div class="meal" data-action="toast:${esc(m.name)}">
        <div class="meal-emoji">${m.emoji}</div>
        <div><div class="meal-name">${esc(m.name)}</div><div class="meal-sub">${esc(m.sub)}</div></div>
        <div class="meal-kcal"><div class="n">${m.kcal}</div><div class="p">${m.protein}g P</div></div>
      </div>`).join('');

    return `<div class="pad">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0 18px">
        <div><div class="h-day">Wed · 16 Jul</div><div class="h-greet" style="font-size:22px">Food</div></div>
        <div class="pill pill-phase">${state.kcalTarget.toLocaleString()} kcal</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="macro">
          <div class="macro-top"><span class="macro-name">Calories</span><span class="macro-val">${kcal.toLocaleString()} / ${state.kcalTarget.toLocaleString()}</span></div>
          ${bar(kcal, state.kcalTarget, 'var(--green)')}
        </div>
        <div class="macro">
          <div class="macro-top"><span class="macro-name" style="color:var(--orange)">Protein — floor</span><span class="macro-val">${protein} / ${state.proteinTarget} g</span></div>
          ${bar(protein, state.proteinTarget, 'var(--orange)')}
        </div>
        <div class="macro">
          <div class="macro-top"><span class="macro-name">Carbs</span><span class="macro-val">${carbs} / 210 g</span></div>
          ${bar(carbs, 210, '#5e5ce6')}
        </div>
        <div class="macro" style="margin-bottom:0">
          <div class="macro-top"><span class="macro-name">Fat</span><span class="macro-val">${fat} / 62 g</span></div>
          ${bar(fat, 62, '#64d2ff')}
        </div>
      </div>

      <div class="section-label">TODAY'S MEALS</div>
      ${meals}

      <button class="add-meal" data-action="quick-meal">＋ Quick add · Nasi + telur (est. 380 kcal)</button>
      <div class="hint" style="margin-top:16px"><span class="b"></span><span>Snap a photo and Coach estimates the dish, portion &amp; protein with a range you confirm — <b>estimates stay labelled as estimates.</b></span></div>
    </div>`;
  }

  function screenBody() {
    const w = WEIGHT_HISTORY;
    const min = Math.min(...w), max = Math.max(...w);
    const bars = w.map((v) => {
      const h = 14 + ((v - min) / (max - min || 1)) * 72;
      return `<i style="height:${h}px"></i>`;
    }).join('');
    const latest = w[w.length - 1];

    return `<div class="pad">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:6px 0 18px">
        <div><div class="h-day">Wed · 16 Jul</div><div class="h-greet" style="font-size:22px">Body</div></div>
        <div class="pill pill-phase">Cut · Wk 3</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--muted-2);font-weight:600">Body weight · 10-day trend</div>
        <div class="big-metric"><span class="n">${latest.toFixed(1)}</span><span class="u">kg</span></div>
        <div class="trend">−1.2 kg this week · on trend for your cut</div>
        <div class="spark">${bars}</div>
        <button class="btn btn-primary" style="margin-top:18px" data-action="log-weight">Log today's weigh-in</button>
      </div>

      <div class="metric-row" style="margin-top:0">
        <div class="metric-mini"><div class="k">Waist</div><div class="n">81.5<span style="font-size:13px;color:var(--muted-2)"> cm</span></div></div>
        <div class="metric-mini"><div class="k">WHR</div><div class="n">0.82</div></div>
        <div class="metric-mini"><div class="k">Body fat</div><div class="n">16<span style="font-size:13px;color:var(--muted-2)">%</span></div></div>
      </div>

      <div class="hint" style="margin-top:16px"><span class="b"></span><span>Weekly progress photos (front / side / back) with a framing overlay and slider compare — <b>private by default, stored encrypted.</b></span></div>
    </div>`;
  }

  function screenReview() {
    // Reflect an in-session substitution into the changelog (open thread from the handoff)
    const swapChange = state.swapped ? `<div class="change">
        <div class="dot" style="background:#8f8bff"></div>
        <div><div class="t">Bench Press → ${esc(state.exName)}</div><div class="d">Swapped mid-session — Coach re-estimated the load so progression still counts.</div></div>
      </div>` : '';

    return `<div>
      <div class="review-head">
        <button class="icon-btn" data-action="nav:today" style="font-size:18px">‹</button>
        <div><div class="sess-kicker">WEEKLY REVIEW</div><div class="sess-name">13–19 Jul · Week 3</div></div>
      </div>
      <div class="pad" style="padding-top:0">
        <div class="review-verdict">
          <div class="ai-badge lg">AI</div>
          <div><div class="l">COACH</div><div class="v">Strong week, Munir.</div></div>
        </div>

        <div class="stat-grid">
          <div class="stat-cell"><div class="k">Sessions</div><div class="n">6<span style="font-size:14px;color:var(--muted-2)">/6</span></div><div class="s" style="color:var(--green)">100% adherence</div></div>
          <div class="stat-cell"><div class="k">Volume</div><div class="n" style="color:var(--green)">+8%</div><div class="s">vs last week</div></div>
          <div class="stat-cell"><div class="k">Protein avg</div><div class="n" style="color:var(--orange)">149<span style="font-size:14px;color:var(--muted-2)">g</span></div><div class="s">under 155 g floor</div></div>
          <div class="stat-cell"><div class="k">Weight</div><div class="n" style="color:var(--green)">−1.1<span style="font-size:14px;color:var(--muted-2)">kg</span></div><div class="s">on trend</div></div>
        </div>

        <div class="section-label">CHANGES I MADE</div>
        ${swapChange}
        <div class="change">
          <div class="dot" style="background:var(--green)"></div>
          <div><div class="t">Thursday bench → 64 kg <span style="color:var(--green);font-weight:600">(+2.5)</span></div><div class="d">Top sets cleared 8 reps two weeks running.</div></div>
        </div>
        <div class="change">
          <div class="dot" style="background:var(--orange)"></div>
          <div><div class="t">Calories → 2,100 <span style="color:var(--orange);font-weight:600">(−50)</span></div><div class="d">Weight loss slowed to 0.4%/wk — nudging the deficit.</div></div>
        </div>
        <div class="change" style="margin-bottom:16px">
          <div class="dot" style="background:#64d2ff"></div>
          <div><div class="t">Protein reminder at 15:00</div><div class="d">You landed under the floor 3 days this week.</div></div>
        </div>

        <div class="coach">
          <div class="coach-head"><div class="ai-badge">AI</div><span class="coach-title">Coach note</span></div>
          <p>Adherence is carrying this cut — every session in, weight bang on trend. The one gap is protein: three days under 155&nbsp;g. Fix that and next week is another clean progression. <b>Keep going.</b></p>
        </div>
      </div>
    </div>`;
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function currentScreen() {
    switch (state.tab) {
      case 'today': return screenToday();
      case 'workout': return screenWorkout();
      case 'food': return screenFood();
      case 'body': return screenBody();
      case 'review': return screenReview();
      default: return screenToday();
    }
  }

  function renderTabbar() {
    const bar = $('#tabbar');
    // Workout is a focused mode in the design — hide the tab bar there.
    if (state.tab === 'workout') { bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.innerHTML = TABS.map(([key, label]) =>
      `<button class="tab ${state.tab === key ? 'active' : ''}" data-action="nav:${key}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[key]}</svg>
        <span>${label}</span>
      </button>`
    ).join('');
  }

  function render() {
    $('#view').innerHTML = currentScreen();
    renderTabbar();
  }

  /* ---- Targeted rest-region update (keeps scroll + sheet) --- */
  function paintRest() {
    const region = $('#restRegion');
    if (region) region.innerHTML = restRegion();
  }

  /* ---- Toast ------------------------------------------------ */
  let toastTimer = null;
  function showToast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; $('.screen').appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  /* =========================================================
     ACTIONS
     ========================================================= */
  function logSet(i) {
    const s = state.sets[i];
    if (!s || s.done) return;
    s.done = true;
    s.reps = s.reps || 8;
    state.rest = 90;
    state.restTotal = 90;
    render();
    if (state.sets.every((x) => x.done)) showToast('All sets logged — great work 💪');
  }

  function chooseAlt(idx) {
    const a = ALTS[idx];
    if (!a) return;
    state.swappedFrom = state.exName;
    state.exName = a.name;
    state.exScheme = a.scheme;
    state.swapped = true;
    state.swapOpen = false;
    state.filter = 'all';
    render();
    showToast(`Swapped to ${a.name} · weight re-estimated`);
  }

  function quickMeal() {
    state.meals.push({ emoji: '🍚', name: 'Nasi + telur', sub: 'Quick add · now', kcal: 380, protein: 18 });
    render();
    showToast('Added · Nasi + telur (380 kcal)');
  }

  function logWeight() {
    showToast(`Weigh-in saved · ${WEIGHT_HISTORY[WEIGHT_HISTORY.length - 1].toFixed(1)} kg`);
  }

  const ACTIONS = {
    'nav': (arg) => { state.tab = arg; if (arg !== 'workout') { /* keep workout state */ } render(); $('#view').scrollTop = 0; },
    'log-set': (arg) => logSet(Number(arg)),
    'skip-rest': () => { state.rest = 0; paintRest(); },
    'open-swap': () => { state.swapOpen = true; render(); },
    'close-swap': () => { state.swapOpen = false; render(); },
    'filter': (arg) => { state.filter = arg; render(); },
    'choose-alt': (arg) => chooseAlt(Number(arg)),
    'quick-meal': () => quickMeal(),
    'log-weight': () => logWeight(),
    'toast': (arg) => showToast(arg),
  };

  /* ---- Event delegation ------------------------------------ */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const raw = el.getAttribute('data-action');
    const sep = raw.indexOf(':');
    const name = sep === -1 ? raw : raw.slice(0, sep);
    const arg = sep === -1 ? undefined : raw.slice(sep + 1);
    const fn = ACTIONS[name];
    if (fn) { e.preventDefault(); fn(arg); }
  });

  /* ---- 1s clock: drives the rest timer ---------------------- */
  setInterval(() => {
    if (state.rest > 0) {
      state.rest -= 1;
      if (state.tab === 'workout') paintRest();
    }
  }, 1000);

  /* ---- Boot ------------------------------------------------- */
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline cache is best-effort */ });
    });
  }
})();
