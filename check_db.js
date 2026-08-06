import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('programs').select('*').eq('user_id', 'ff81cde0-f0eb-4e79-9798-3912eeff9dd4');
  console.log('Programs count:', data?.length);
  if (data?.length > 0) {
      console.log('Sample program:', data[0]);
  }
}
run();
