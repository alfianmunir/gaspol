# Supabase backend — status & remaining steps

Backend for Gaspol on its **dedicated** project (`kxhalnjrcayzsbclfeaz`, name
`gaspol`, region `ap-southeast-2`). See [BACKEND.md](./BACKEND.md) for *why*
Supabase. The whole database belongs to Gaspol; tables keep the `fit_*` prefix
for continuity. (The app was first prototyped on a shared project and migrated
here — the base schema now lives in git at `migrations/20260703000000_fit_base_schema.sql`.)

## ✅ Already applied to the live project

- **Base schema** (`migrations/20260703000000_fit_base_schema.sql`) — all nine
  `fit_*` tables, upsert indexes, `fit_coach_notes.data` (F8), the `fit_photos`
  table + private `fit-photos` storage bucket, open `fit anon all` prototype
  policies, and role grants. Seeded with the program (41 exercises), the quick-add
  food library (16), the imported body/scan rows (2), settings (3), and the welcome
  coach note (1).
- **Additive migration** (`migrations/20260716120000_fit_additive.sql`) is folded
  into the base schema above (kept in the repo as history; idempotent if re-run).
- **Edge functions deployed** (ACTIVE): `fit-food-estimate` (verify_jwt=true) and
  `fit-weekly-review` (verify_jwt=false; fails closed with 403 until `CRON_SECRET`
  is set, so it is never an open endpoint).

- **Frontend wired** — `config.js` (committed; public anon key) points the app at
  this project and `requireAuth: true`. On boot `app.js` lazy-loads `data.js`,
  calls `GaspolData.init()`, and hydrates every read-driven tab (best-effort —
  an empty table falls back to seed): `hydrateSession / hydrateFood / hydrateBody /
  hydrateScan / hydrateCheckin / hydrateCheckinHistory / hydrateConsult /
  hydrateReminders / hydrateReview / hydrateProfile`.
- **Auth + per-user RLS ENFORCED** — Email/Google sign-in gate is live;
  `migrations/20260716120100_fit_rls_enforce.sql` has been applied. Every `fit_*`
  row is owned by the signed-in account and readable only by that `authenticated`
  user (the open `anon` policies are gone). `fit_foods` NULL rows remain the shared
  library. `fit-weekly-review` writes with the service-role key (bypasses RLS), so
  the Sunday review keeps working.
- **Weekly-review cron SCHEDULED** — `pg_cron` + `pg_net` enabled; Vault holds
  `project_url` + a generated `cron_secret`; job `gaspol-weekly-review` runs
  `0 12 * * 0` (Sun 19:00 WIB). See `supabase/schedules.sql`.

## ⏭ Remaining (manual — dashboard only)

**Set the Edge-Function secrets.** These are function environment variables — they
can only be set in the dashboard (Edge Functions → Secrets) or via the CLI, not
through the DB/MCP.

1. **`CRON_SECRET`** — required for the Sunday review to run. It must EXACTLY match
   the `cron_secret` already generated in Vault. Reveal that value (Dashboard → SQL
   Editor), then paste it into the function secret:
   ```sql
   select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';
   ```
   Edge Functions → Secrets → add `CRON_SECRET = <that value>`. Until it's set,
   `fit-weekly-review` returns 403 to everyone (fail-closed) and the cron no-ops.

2. **`ANTHROPIC_API_KEY`** — *optional*. Only used to word the weekly-review note
   with Claude; without it the review still posts a solid deterministic note. NOT
   needed for food photos — those now run **on-device** (`foodvision.js`, no key).
   The `fit-food-estimate` function is only used if you wire the optional cloud path.

   ```bash
   # CLI equivalent, if you prefer:
   supabase link --project-ref kxhalnjrcayzsbclfeaz
   supabase secrets set CRON_SECRET=<vault value>  ANTHROPIC_API_KEY=sk-ant-...
   ```

**Test the review without waiting for Sunday** (Dashboard → SQL Editor):
```sql
select net.http_post(
  url     := 'https://kxhalnjrcayzsbclfeaz.supabase.co/functions/v1/fit-weekly-review',
  headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
               (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')),
  body    := '{}'::jsonb
);
-- then: select * from fit_coach_notes order by created_at desc limit 1;
```

## Frontend write paths (already wired)

| UI action | data.js call |
|-----------|--------------|
| log a set | `logSet({exerciseId,setNumber,weight,reps})` (queues offline) |
| finish session | `applyProgression(exercise, recentSessions)` |
| quick-add / log meal | `logFood({...})` |
| snap a meal | on-device `foodvision.estimate()` (no API) → `logFood(...)` |
| weigh-in | `logWeighIn({weightKg,...})` |
| save check-in | `saveCheckin({sleepHours,energy,soreness})` |
| toggle a reminder | `setReminder(key, on)` |
| open Progress | `getWeeklyReview()` |
| sign in (gate) | `signInWithGoogle()` / `sendMagicLink(email)` |
| sign out (Settings) | `signOut()` |
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
