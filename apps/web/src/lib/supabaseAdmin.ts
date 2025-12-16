import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "./env";
import { getServerEnv } from "./envServer";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  adminClient = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return adminClient;
}
