/* Gaspol — frontend config (committed intentionally).
 *
 * The anon (publishable) key below is PUBLIC BY DESIGN — it ships in every
 * client bundle and the real protection is Row-Level Security on the fit_*
 * tables. It is NOT the service-role key (which must never be committed).
 *
 * Loaded before app.js so the app boots against Supabase instead of seed data.
 * Values: get_project_url → url, get_publishable_keys → anonKey.
 */
window.GASPOL_CONFIG = {
  url: "https://kxhalnjrcayzsbclfeaz.supabase.co",
  anonKey: "sb_publishable_toCWnsGu-lntkw_T_G1G6w_Y97ZhxBt",

  // Flip to true ONLY after you have:
  //   1. enabled an auth provider (Google/Email) in Supabase, and
  //   2. applied migrations/20260716120100_fit_rls_enforce.sql.
  // When true, the app shows a sign-in gate and scopes all data per user.
  // While false, it runs the open single-user prototype (anon key).
  requireAuth: true,
};
