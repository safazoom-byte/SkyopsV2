import { createClient } from "@supabase/supabase-js";
async function run() {
  try {
    const client = createClient("https://xyz.supabase.co", "xyz");
    await client.auth.getUser(undefined);
  } catch(e) {
    console.error("Error:", e.message);
  }
}
run();
