import { createClient } from "@supabase/supabase-js";
export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });
  try {
    const authHeader = req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.split(" ")[1];
    
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    
    if (!serviceKey) return res.status(400).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    
    const supabaseAdmin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (!supabaseAdmin) throw new Error("supabaseAdmin is undefined");
    if (!supabaseAdmin.auth) throw new Error("supabaseAdmin.auth is undefined");
    if (!supabaseAdmin.auth.admin) throw new Error("supabaseAdmin.auth.admin is undefined");
    
    const supabaseAnon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (!supabaseAnon) throw new Error("supabaseAnon is undefined");
    if (!supabaseAnon.auth) throw new Error("supabaseAnon.auth is undefined");
    
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) return res.status(401).json({ error: "Unauthorized" });
    
    const { email, password, role, airport_id } = req.body || {};
    
    const createRes = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createRes.error) throw createRes.error;
    
    if (createRes.data?.user) {
      await supabaseAdmin.from("user_profiles").upsert({
        id: createRes.data.user.id, email, role, airport_id, ai_daily_limit: 5, ai_weekly_limit: 20, ai_monthly_limit: 50, max_staff: 50, max_shifts: 20,
      });
    }
    res.status(200).json({ success: true, user: createRes.data?.user });
  } catch (err: any) {
    console.error("Create user error:", err);
    res.status(400).json({ error: `VercelAPI: ${err.message}` });
  }
}
