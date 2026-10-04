import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client for server-only writes that no user should be able to make
 * (the shared fx_rates cache). Returns null when SUPABASE_SERVICE_ROLE_KEY isn't configured;
 * callers must degrade gracefully. Never import this from client code.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") throw new Error("createAdminClient is server-only");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
