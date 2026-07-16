/* Gaspol — frontend config.
 * Copy to `config.js` and fill in your project's values, then load it
 * BEFORE app.js / data.js:  <script src="./config.js"></script>
 *
 * The anon (publishable) key is public by design — real protection is RLS.
 * Get both from the Supabase dashboard, or via the Supabase MCP:
 *   get_project_url  →  url
 *   get_publishable_keys  →  anonKey
 *
 * config.js is gitignored so you never commit environment values.
 */
window.GASPOL_CONFIG = {
  url: "https://ticdiatbdxkmpzmqvntn.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_PUBLISHABLE_KEY",
};
