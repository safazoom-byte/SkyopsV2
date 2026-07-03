const { createClient } = require('@supabase/supabase-js');
try {
  createClient("", "key", { auth: { autoRefreshToken: false, persistSession: false } });
} catch(e) {
  console.log(e.message);
}
