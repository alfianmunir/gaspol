# Supabase backend — status & remaining steps

Backend for Gaspol on the existing project (`ticdiatbdxkmpzmqvntn`, region
`ap-southeast-1`). See [BACKEND.md](./BACKEND.md) for *why* Supabase. That project
is **shared** with "No Bites Left" — everything here only touches `fit_*` tables,
a new `fit-photos` bucket, and `fit-*` functions.

## ✅ Already applied to the live project

- **Additive migration** (`migrations/20260716120000_fit_additive.sql`) — added
  `user_id` columns (nullable), upsert indexes, `fit_coach_notes.data` (F8), the
  `fit_photos` table, and the private `fit-photos` storage bucket. **Non-breaking:**
  the prototype's open `fit anon all` policies are still in place, so existing data
  (41 exercises, settings, etc.) stays visible.
- **Edge functions deployed** (ACTIVE): `fit-food-estimate` (verify_jwt=true) and
  `fit-weekly-review` (verify_jwt=false; fails closed with 403 until `CRON_SECRET`
  is set, so it is never an open endpoint).

## ⏭ Remaining (manual — needs your keys / decisions)

1. **Set function secrets** (both functions need these to actually run):
   ```bash
   supabase link --project-ref ticdiatbdxkmpzmqvntn
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  CRON_SECRET=$(openssl rand -hex 24)
   ```
   Until `ANTHROPIC_API_KEY` is set the functions return 500 at the Claude call;
   until `CRON_SECRET` is set `fit-weekly-review` returns 403 to everyone.

2. **Schedule the Sunday review** (Dashboard → SQL editor): enable `pg_cron` +
   `pg_net`, store the Vault secrets, then run `supabase/schedules.sql`
   (Sundays 19:00 WIB). Test by hand once secrets are set:
   ```bash
   curl -X POST "https://ticdiatbdxkmpzmqvntn.supabase.co/functions/v1/fit-weekly-review" \
     -H "x-cron-secret: $CRON_SECRET"
   ```

3. **Point the frontend at the backend** (on Vercel). The app reads the backend
   only when `window.GASPOL_CONFIG` is set. Create `config.js` (gitignored) next to
   `index.html` and uncomment its `<script>` tag in `index.html`:
   ```js
   window.GASPOL_CONFIG = {
     url: "https://ticdiatbdxkmpzmqvntn.supabase.co",
     anonKey: "sb_publishable_…"   // publishable key from the dashboard (public by design)
   };
   ```
   On boot `app.js` lazy-loads `data.js`, calls `GaspolData.init()`, and hydrates
   every read-driven tab (best-effort — an empty table falls back to seed):
   `hydrateSession / hydrateFood / hydrateBody / hydrateScan / hydrateCheckin /
   hydrateCheckinHistory / hydrateConsult / hydrateReminders / hydrateReview /
   hydrateProfile`.

4. **Enforce per-user RLS — LATER, after auth.** `migrations/20260716120100_fit_rls_enforce.sql`
   is **not applied**. It replaces the open policies with per-user ones and is
   **destructive to the single-user prototype** until you add auth (email/Google)
   and backfill `user_id` on existing rows (statements in that file's header). Run
   it only then.

## Frontend write paths (already wired)

| UI action | data.js call |
|-----------|--------------|
| log a set | `logSet({exerciseId,setNumber,weight,reps})` (queues offline) |
| finish session | `applyProgression(exercise, recentSessions)` |
| quick-add / log meal | `logFood({...})` |
| snap a meal | `estimateFoodPhoto(file)` → `logFood(...)` |
| weigh-in | `logWeighIn({weightKg,...})` |
| save check-in | `saveCheckin({sleepHours,energy,soreness})` |
| toggle a reminder | `setReminder(key, on)` |
| open Progress | `getWeeklyReview()` |
| open Body → scan card | `getScan()` (latest `fit_body_metrics` row with a `scan` payload) |
| Today/Check-in recovery signal | `getCheckinHistory(7)` (last 7 `fit_checkins`, oldest→newest) |
| open Consult | `getConsultLog()` (thread from `fit_settings.consult_log`) |
| send a consult message | `consult(question, answer)` (appends to `fit_settings.consult_log`, capped 30) |

`data.js` scopes every read/write to the signed-in user and queues set logs in
IndexedDB, flushing when back online — so gym logging works with no signal.

## Repo layout

```
progression.js                         Auto-progression + calorie rules (F3/F8), browser
data.js                                Frontend data layer (Supabase) + offline queue
config.example.js                      → copy to config.js (gitignored) with your keys
supabase/
  config.toml                          CLI project link + per-function verify_jwt
  .env.example                         Function secrets (ANTHROPIC_API_KEY, CRON_SECRET)
  schedules.sql                        pg_cron entry for the Sunday review
  migrations/
    20260716120000_fit_additive.sql       APPLIED — non-breaking multi-user prep + F8 col + photos
    20260716120100_fit_rls_enforce.sql    NOT applied — per-user RLS lockdown (after auth + backfill)
  functions/
    _shared/                           cors, admin/user clients, claude helper, progression.ts
    fit-food-estimate/index.ts         F5 — AI food-photo estimate (premium)
    fit-weekly-review/index.ts         F8 — Sunday coach review (cron)
```

`progression.js` (browser) and `functions/_shared/progression.ts` (Deno) are the
**same rules** in two runtimes — edit both together.

## Notes

- Anon/publishable key is public by design; RLS is the real guard. Never commit the
  service-role key.
- Cost control (PRD §10): the review is 1 Claude call/user/week; food-photo is
  premium-gated in `fit-food-estimate` via `fit_settings.profile.premium`.
