# Gaspol — AI Personal Trainer & Meal Coach

A hi-fi, **dark, AI-first mobile** implementation of the Gaspol app — an adaptive
training + nutrition coach that updates your plan from what you actually do
(not just a logbook). Built from the `Gaspol.dc.html` design (18 screens across
F1–F10) and the product spec in `PRD_AI_Personal_Trainer.md`.

Persona for sample data: **P1 "Munir", Phase 1 Cut — 2,150 kcal / 155 g protein**,
Push A session, Week 3 of 4.

## Run it

It's a zero-build static PWA — open `index.html` in a browser, or serve the
folder over any static server (recommended, so the manifest / service worker load):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

On desktop it renders centred in a phone frame; on a phone it fills the screen and
is **installable** (Add to Home Screen) and works offline after first load. First
launch shows onboarding; you can replay it from **Settings → Replay onboarding**.

## Screens & interactions (all 18 design screens, wired into one flow)

| Area | Design | What works |
|------|--------|-----------|
| **Onboarding** (F1) | `3c` `3d` | Goal picker (Cut / Recomp / Lean bulk, live selection) → generated 4-week plan preview → **Start with Push A** drops you into workout mode. Skippable. |
| **Today** (F1) | `1a` | Coach briefing, today's session, live calorie/protein rings driven by logged meals, quick actions, settings gear |
| **Workout** (F2) | `1c` | Tap ✓ to log a set → **90 s rest timer** auto-counts down; **Finish session** appears when all sets are in |
| **Swap** (F2) | `2a` | Bottom sheet, filter chips (All/Machine/Dumbbell/Bodyweight), AI-matched alternatives, weight re-estimation + "Swapped from…" confirmation |
| **Session report** (F4) | `4a` | Prescribed vs performed with **Exceeded ↑ / Hit ✓ / Under ↓** tags, volume/streak, coach note |
| **Food** (F5) | `3b` | Macro bars vs targets, quick-add presets, logged-today list, "Snap a meal" |
| **AI food photo** (F5) | `3a` | **Live portion stepper** rescales kcal/protein with honest ± ranges; log adds it to the day |
| **Body** (F6) | `4b` | Weight trend chart, waist/hip → WHR, body-fat estimate, weigh-in |
| **Progress photos** (F6) | `4c` | **Draggable before/after slider**, front/side/back segmented, privacy note |
| **Check-in** (F7) | `4d` | Sleep + **tappable 1–5 energy/soreness** ratings feeding a coach line |
| **Weekly review** (F8) | `1e` | Stat grid + "changes I made" changelog; an in-session swap is **reflected back** into it |
| **Reminders** (F9) | `5a` | **Live toggles** for essentials + coach nudges + WhatsApp (premium) |
| **Settings** (F10) | `5b` | Profile, premium status, preferences, data export/privacy, replay onboarding |

## Tech

- **Vanilla HTML/CSS/JS** — no framework, no build step. A small central `state`
  object + `render()` engine (`app.js`) rebuilds the active screen; the workout
  rest timer runs off a single 1 s interval and repaints only its own region so
  scroll position and open sheets are preserved. The photo-compare slider updates
  the DOM directly during drag for smoothness.
- Navigation is a simple `state.tab` route; tab-bar screens (Today/Food/Body/Progress)
  keep the bottom bar, focused/full screens (workout, onboarding, report, check-in,
  settings, reminders, photos, food-photo) hide it and carry their own back/close.
- Event handling is delegated via `data-action` attributes.
- **PWA**: `manifest.webmanifest` + `sw.js` (offline-first shell cache — PRD §8:
  "must work in a basement gym").
- Design tokens (dark palette, radii, type) lifted from the design component into
  CSS custom properties in `styles.css`.

## Files

```
index.html            app shell (device frame, status bar, tab bar mount)
styles.css            design tokens + all component styles
app.js                state, all 18 screens, and the live interactions
manifest.webmanifest  PWA metadata
sw.js                 offline service worker
icon.svg              app icon
BACKEND.md            recommended backend framework + data model + wiring plan
```

## Backend

The app currently runs fully client-side on seeded persona data so every screen
and flow is demoable with no server. See **[BACKEND.md](./BACKEND.md)** for the
recommended backend (Supabase) and how to wire it in — it matches the existing
`fit_` Supabase project and the weekly AI coach-review automation described in the
handoffs, and the PRD's architecture table.
