import { createClient } from "@supabase/supabase-js";
try {
  const client = createClient("", "");
  console.log("Client:", client);
} catch(e) {
  console.error("Error:", e.message);
}
