# Supabase backend — setup & wiring

This scaffolds the data layer and Edge Functions for Gaspol on the existing
Supabase project (`ticdiatbdxkmpzmqvntn`, region `ap-southeast-1`). See
[BACKEND.md](./BACKEND.md) for *why* Supabase. That project is **shared** with
"No Bites Left" — everything here only touches `fit_*` tables and `fit-*`
functions.

## What's in the repo

```
progression.js                         Auto-progression + calorie rules (F3/F8), browser
data.js                                Frontend data layer (Supabase) + offline queue
config.example.js                      → copy to config.js (gitignored) with your keys
supabase/
  config.toml                          CLI project link + per-function verify_jwt
  .env.example                         Function secrets (ANTHROPIC_API_KEY, CRON_SECRET)
  schedules.sql                        pg_cron entry for the Sunday review
  migrations/20260716120000_fit_multiuser.sql   user_id + RLS + photos + storage
  functions/
    _shared/                           cors, admin/user clients, claude helper, progression.ts
    fit-food-estimate/index.ts         F5 — AI food-photo estimate (premium)
    fit-weekly-review/index.ts         F8 — Sunday coach review (cron)
```

`progression.js` (browser) and `functions/_shared/progression.ts` (Deno) are the
**same rules** in two runtimes — edit both together.

## 1. Database (multi-user)

The migration turns the single-user prototype into per-user RLS.

```bash
supabase link --project-ref ticdiatbdxkmpzmqvntn
supabase db reset            # local first — verify against a local stack
# then, when happy:
supabase migration up        # applies to the linked project
```

Before RLS is enforced, backfill existing prototype rows with your uid (the
migration header has the exact statements). The migration also creates the
private `fit-photos` storage bucket (F6) and its per-user object policies.

## 2. Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  CRON_SECRET=$(openssl rand -hex 24)
supabase functions deploy fit-food-estimate                 # verify_jwt=true (config.toml)
supabase functions deploy fit-weekly-review --no-verify-jwt
```

Then schedule the review (Dashboard → SQL editor): enable `pg_cron` + `pg_net`,
store the two Vault secrets, and run `supabase/schedules.sql` (Sundays 19:00 WIB).

Test the review by hand:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/fit-weekly-review" \
  -H "x-cron-secret: $CRON_SECRET"
```

## 3. Wire the frontend

The app currently runs on seeded persona data (so the demo needs no backend).
To go live, front the seeds with `data.js` — no screen/render changes:

1. `cp config.example.js config.js` and fill `url` + `anonKey`
   (Supabase MCP: `get_project_url`, `get_publishable_keys`).
2. In `index.html`, before `app.js`:
   ```html
   <script src="./config.js"></script>
   ```
3. In `app.js`, replace the seed reads with the data layer at boot:
   ```js
   import { GaspolData } from './data.js';
   await GaspolData.init();
   const today = await GaspolData.getTodaySession();   // → state.exName / state.sets …
   ```
   Keep the optimistic local updates the UI already does; each action also
   calls through:
   | UI action            | data.js call |
   |----------------------|--------------|
   | log a set            | `logSet({exerciseId,setNumber,weight,reps})` (queues offline) |
   | finish session       | `applyProgression(exercise, recentSessions)` |
   | quick-add / log meal  | `logFood({...})` |
   | snap a meal          | `estimateFoodPhoto(file)` → `logFood(...)` |
   | weigh-in             | `logWeighIn({weightKg,...})` |
   | save check-in        | `saveCheckin({sleepHours,energy,soreness})` |
   | toggle a reminder    | `setReminder(key, on)` |
   | open Progress        | `getLatestReview()` / `getCoachNotes()` |

`data.js` scopes every read/write to the signed-in user and queues set logs in
IndexedDB, flushing when back online — so gym logging works with no signal.

## Notes

- Anon/publishable key is public by design; RLS is the real guard. Never commit
  `config.js` or the service-role key (both gitignored / server-only).
- Cost control (PRD §10): the review is 1 Claude call/user/week; food-photo is
  premium-gated in `fit-food-estimate` via `fit_settings.profile.premium`.
