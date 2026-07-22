import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('audit_logs').select('*').eq('user_email', 'safazoom@gmail.com').eq('action_type', 'UPDATE').eq('entity_type', 'USER_PROFILE').order('created_at', { ascending: false }).limit(2);
  console.log('Error:', error);
  console.log('Data:', data);
}
run();
