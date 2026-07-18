// Service-role Supabase client for server-side jobs (weekly review).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// NEVER expose the service-role key to the browser.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// A client bound to the caller's JWT — RLS applies, so it only ever sees
// that user's rows. Use for user-scoped endpoints (food-photo estimate).
export function userClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, {
    global: { headers: { Authorization: authHeader ?? "" } },
    auth: { persistSession: false },
  });
}
