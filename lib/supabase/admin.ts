import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Service role — bypasa RLS. Solo usar en server-side (webhooks, worker, jobs).
export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
