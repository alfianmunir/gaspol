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
  url: "https://ticdiatbdxkmpzmqvntn.supabase.co",
  anonKey: "sb_publishable_NfeCBD9tGXW8z6uuEfMtLg_HZG0wx2_",
};
