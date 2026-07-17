-- ============================================================
-- Gaspol — enforce per-user RLS on fit_* (PRD F10)
-- STATUS: NOT YET APPLIED. This is DESTRUCTIVE to the single-user prototype.
--
-- Run this ONLY after:
--   1. Auth is live (email/Google), and
--   2. You have BACKFILLED user_id on every existing fit_ row with your uid:
--        update fit_exercises    set user_id = '<your-uid>' where user_id is null;
--        update fit_set_logs     set user_id = '<your-uid>' where user_id is null;
--        update fit_foods        set user_id = '<your-uid>' where user_id is null; -- or leave shared library null
--        update fit_food_logs    set user_id = '<your-uid>' where user_id is null;
--        update fit_body_metrics set user_id = '<your-uid>' where user_id is null;
--        update fit_checkins     set user_id = '<your-uid>' where user_id is null;
--        update fit_settings     set user_id = '<your-uid>' where user_id is null;
--        update fit_coach_notes  set user_id = '<your-uid>' where user_id is null;
--
-- Before this runs, the open "fit anon all" policies (from the prototype) keep
-- data visible to the anon key. After it runs, rows are visible ONLY to their
-- owner — so un-backfilled rows disappear from the app until assigned an owner.
-- ============================================================

-- Replace the prototype's open policies with per-user ones. Owner = user_id.
do $$
declare t text;
begin
  foreach t in array array[
    'fit_exercises','fit_set_logs','fit_food_logs','fit_body_metrics',
    'fit_checkins','fit_settings','fit_coach_notes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "fit anon all" on %I', t);  -- the prototype's open policy
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format($f$
      create policy %I on %I
        for all
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $f$, t || '_owner', t);
  end loop;
end $$;

-- fit_foods: shared library (user_id null) readable by everyone; users may
-- add/edit only their own custom foods.
alter table fit_foods enable row level security;
drop policy if exists "fit anon all" on fit_foods;
drop policy if exists fit_foods_read on fit_foods;
drop policy if exists fit_foods_write on fit_foods;
create policy fit_foods_read  on fit_foods for select using (user_id is null or user_id = auth.uid());
create policy fit_foods_write on fit_foods for all using (user_id = auth.uid()) with check (user_id = auth.uid());
