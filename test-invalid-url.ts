import { createClient } from "@supabase/supabase-js";
try {
  const client = createClient("invalid_url", "key");
} catch (e) {
  console.error("Error:", e.message);
}
