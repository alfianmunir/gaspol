# Backend framework — recommendation

You asked which backend to build on. Short answer: **stay on Supabase.** It's what
the prototype already runs, it's in the PRD's architecture table, and it gives you
Postgres + Auth + row-level security + file storage + serverless functions in one
managed box — which is exactly the surface F1–F10 needs, with the least glue code
for a solo builder.

## Why Supabase (not a fresh framework)

| Need (from the PRD) | Supabase piece | Notes |
|---|---|---|
| Per-user data isolation (F10) | Postgres **Row-Level Security** | One `user_id` column + policy per table; the multi-user story is a config change, not a rewrite. |
| Email / Google auth (F10) | Supabase **Auth** | Drop-in; issues the JWT RLS reads. |
| Progress photos, encrypted (F6) | Supabase **Storage** | Private buckets, signed URLs. |
| Weekly AI review + food-photo (F5/F8) | **Edge Functions** calling the Claude API | Cron for the Sunday review (1 call/user/week); an on-demand endpoint for photo estimates (premium-gated). |
| Offline-first set logging (F2) | client IndexedDB queue → sync | Supabase is just the sync target; the rules engine stays in the app so it works with no signal. |

You already have the project (`ticdiatbdxkmpzmqvntn`, region `ap-southeast-1`) with
seeded `fit_*` tables and a Sunday 19:00 coach-review job. Building on it keeps that
automation working. **It's a shared project** (it also hosts "No Bites Left") — all
fitness tables are prefixed `fit_`; never touch non-`fit_` tables.

> Lesson carried over from the throwaway prototype: **do not serve the frontend
> from an Edge Function.** It returned HTML as `text/plain` and browsers showed raw
> source. Host this static PWA on Vercel / Netlify / Cloudflare Pages and let
> Supabase be data-only.

## If you'd rather not use Supabase

Ranked for this specific app + a solo builder:

1. **Supabase** — recommended. Least to build; matches existing infra.
2. **Pocketbase** — single Go binary, SQLite, built-in auth + rules + file storage.
   Great if you want to self-host cheaply and own the box. Trade-off: you run it,
   scaling story is more manual, no managed edge/cron (use a small worker).
3. **Firebase** — comparable managed bundle, but a document DB fits this
   relational, aggregate-heavy data (weekly volume, trends) worse than Postgres,
   and you'd migrate off the existing schema.
4. **Custom API** (Hono/Fastify/NestJS on Node, or FastAPI on Python) + hosted
   Postgres (Neon/Supabase DB) — maximum control, most code. Only worth it if you
   outgrow RLS-in-the-DB and need heavy custom server logic. Premature for V1.

**The AI layer is the same regardless:** the weekly review and food-photo estimate
call the **Claude API** (latest models: Opus/Sonnet/Haiku 4.x, Fable 5). Keep the
key server-side (Edge Function / your API), never in the shipped frontend.

## Data model (carries over from the prototype + PRD)

Existing `fit_*` tables: `exercises`, `set_logs`, `foods`, `food_logs`,
`body_metrics`, `checkins`, `settings` (`targets` / `profile` / `rules`),
`coach_notes`. For multi-user, add `users`, `plans`, `plan_phases`, `photos`,
`notifications`, and a `user_id` column + RLS policy on every table.

## Wiring this frontend to it

The current app is deliberately backend-agnostic: all data lives in the `state`
object in `app.js` (seeded with Munir's persona). To connect Supabase, replace those
seeds with a thin data module — no screen/render changes needed:

1. `npm i @supabase/supabase-js`; create a client with the project URL + the
   **publishable/anon** key (public by design; real protection is RLS).
2. Add `data.js` exposing `getToday()`, `logSet()`, `logMeal()`, `estimatePhoto()`,
   `getWeeklyReview()`, `saveCheckin()`, `getReminders()/setReminder()` — each a
   Supabase query/RPC (or an IndexedDB write that syncs later for the workout path).
3. On boot, hydrate `state` from `getToday()` instead of the literals; on each
   action, write through the data module and keep the optimistic local update the UI
   already does.
4. Move progression (F3) and the weekly review (F8) rules into an Edge Function so
   they run server-side too, staying compatible with the existing Sunday cron.

Get the URL/keys from the Supabase MCP (`get_project_url`, `get_publishable_keys`)
rather than hardcoding them.
