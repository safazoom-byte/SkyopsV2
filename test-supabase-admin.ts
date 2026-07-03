import { createClient } from "@supabase/supabase-js";
try {
  const client = createClient("https://example.supabase.co", "key", { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(!!client.auth.admin);
} catch (e) {
  console.error("Error:", e.message);
}
