-- ============================================================
-- Gaspol — enable per-user RLS on fit_* (PRD F10)
-- STATUS: NOT YET APPLIED. Ready to run in one shot.
--
-- WHAT IT DOES (single transaction, idempotent, safe to re-run):
--   1. Resolves the owner uid = your signed-in account (the only auth user).
--   2. Backfills user_id on every prototype row that predates auth
--      (fit_foods is skipped on purpose: user_id NULL = shared global library).
--   3. Replaces the open "fit anon all" policies with per-user owner policies
--      scoped to the `authenticated` role.
--
-- RUN IT ONLY AFTER:
--   1. You have enabled an auth provider (Google and/or Email) in Supabase, AND
--   2. You have signed in to the app at least once (so auth.users has your row).
--
-- Before this runs, the anon key can see everything (prototype mode).
-- After it runs, a request sees rows ONLY when signed in as their owner —
-- so the app must sign the user in (set requireAuth:true in config.js).
-- ============================================================

do $$
declare
  owner uuid;
  n_users int;
  t text;
begin
  -- ---- 1. Resolve owner ------------------------------------------------
  -- Single-user app: the one auth user is the owner. If you somehow have
  -- more than one account, this stops and asks you to hard-code your uid:
  --   set `owner` below to '<your-uid>' and delete the count guard.
  select count(*) into n_users from auth.users;
  if n_users = 0 then
    raise exception 'No auth user found. Enable auth and sign in once before running this migration.';
  elsif n_users > 1 then
    raise exception 'Multiple auth users (%). Hard-code `owner` to your uid at the top of this block, then re-run.', n_users;
  end if;
  select id into owner from auth.users limit 1;

  -- ---- 2. Backfill ownership on pre-auth rows --------------------------
  update fit_exercises    set user_id = owner where user_id is null;
  update fit_set_logs     set user_id = owner where user_id is null;
  update fit_food_logs    set user_id = owner where user_id is null;
  update fit_body_metrics set user_id = owner where user_id is null;
  update fit_checkins     set user_id = owner where user_id is null;
  update fit_settings     set user_id = owner where user_id is null;
  update fit_coach_notes  set user_id = owner where user_id is null;
  -- fit_foods intentionally NOT backfilled — NULL rows stay the shared library.

  -- ---- 3. Swap open policies → per-user owner policies -----------------
  foreach t in array array[
    'fit_exercises','fit_set_logs','fit_food_logs','fit_body_metrics',
    'fit_checkins','fit_settings','fit_coach_notes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "fit anon all" on %I', t);   -- prototype's open policy
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format($f$
      create policy %I on %I
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $f$, t || '_owner', t);
  end loop;
end $$;

-- fit_foods: shared library (user_id NULL) readable by any signed-in user;
-- each user can add/edit only their own custom foods.
alter table fit_foods enable row level security;
drop policy if exists "fit anon all" on fit_foods;
drop policy if exists fit_foods_read on fit_foods;
drop policy if exists fit_foods_write on fit_foods;
create policy fit_foods_read  on fit_foods for select to authenticated using (user_id is null or user_id = auth.uid());
create policy fit_foods_write on fit_foods for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- fit_photos already carries an owner policy (fit_photos_owner) from the
-- additive migration — no change needed here.

-- ---- Verify (optional): run after the migration to confirm ownership --
--   select 'unowned rows' as check,
--     (select count(*) from fit_exercises    where user_id is null) as exercises,
--     (select count(*) from fit_body_metrics where user_id is null) as body,
--     (select count(*) from fit_settings     where user_id is null) as settings;
--   -- fit_foods NULLs are expected (shared library); the rest should be 0.
