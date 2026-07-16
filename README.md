# Gaspol — AI Personal Trainer & Meal Coach

A hi-fi, **dark, AI-first mobile** implementation of the Gaspol app — an adaptive
training + nutrition coach that updates your plan from what you actually do
(not just a logbook). Built from the `Gaspol.dc.html` design exploration and the
product spec in `PRD_AI_Personal_Trainer.md`.

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
is **installable** (Add to Home Screen) and works offline after first load.

## Screens & interactions

| Tab | Design source | What works |
|-----|---------------|-----------|
| **Today** | `1a` daily coach briefing | Coach card, today's session, live calorie/protein rings (driven by logged meals), quick actions |
| **Workout** | `1c` guided set table + `2a` swap | Tap ✓ to log a set → **90 s rest timer** bar auto-counts down; **Swap** opens a bottom sheet with filter chips (All / Machine / Dumbbell / Bodyweight) and AI-matched alternatives; picking one re-estimates the working weight and shows a "Swapped from…" confirmation |
| **Food** | `F5` meal logging | Macro bars vs targets (protein-floor emphasis), meal list, one-tap quick-add that updates the day's totals |
| **Body** | `F6` body tracking | 10-day weight trend sparkline, waist / WHR / body-fat metrics, log weigh-in |
| **Progress** | `1e` weekly review | Stat grid + "changes I made" changelog; an in-session exercise swap is **reflected back** into the changelog |

## Tech

- **Vanilla HTML/CSS/JS** — no framework, no build step. A small central `state`
  object + `render()` engine (`app.js`) rebuilds the active screen; the workout
  rest timer runs off a single 1 s interval and repaints only its own region so
  scroll position and open sheets are preserved.
- Event handling is delegated via `data-action` attributes.
- **PWA**: `manifest.webmanifest` + `sw.js` (offline-first shell cache — PRD §8:
  "must work in a basement gym").
- Design tokens (dark palette, radii, type) are lifted straight from the design
  component into CSS custom properties in `styles.css`.

## Files

```
index.html            app shell (device frame, status bar, tab bar mount)
styles.css            design tokens + all component styles
app.js                state, screens, and the live workout/swap logic
manifest.webmanifest  PWA metadata
sw.js                 offline service worker
icon.svg              app icon
```

## Not yet built (from the PRD backlog)

Onboarding / plan generation (F1), AI food-photo estimate capture (F5), progress
photos & slider compare (F6), accounts + Supabase sync (F10), push/WhatsApp
reminders (F9). The current build is the single-user front-end shell those plug into.
