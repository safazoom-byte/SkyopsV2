import { createClient } from "@supabase/supabase-js";
try {
  const client = createClient("", "", { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(client.auth);
} catch (e) {
  console.error("Error:", e.message);
}
