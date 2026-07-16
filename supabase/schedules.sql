-- ============================================================
-- Gaspol — schedule the weekly AI coach review (PRD F8)
-- Sundays 19:00 Asia/Jakarta = 12:00 UTC. Uses pg_cron + pg_net to call
-- the fit-weekly-review Edge Function. Run once in the SQL editor.
--
-- Prereqs (Dashboard → Database → Extensions): enable `pg_cron`, `pg_net`.
-- Store secrets so we don't hardcode them here:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- (or replace the reads below with literals if you're not using Vault)
-- ============================================================

select cron.schedule(
  'gaspol-weekly-review',
  '0 12 * * 0',                       -- 12:00 UTC every Sunday = 19:00 WIB
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/fit-weekly-review',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- To inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('gaspol-weekly-review');
