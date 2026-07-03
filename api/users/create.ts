import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  // Allow CORS if needed
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    
    const { email, password, role, airport_id } = req.body;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasServiceKey) {
      return res.status(400).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY. Cannot create users programmatically without it." });
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    const supabaseAnon = createClient(
      process.env.VITE_SUPABASE_URL || "",
      process.env.VITE_SUPABASE_ANON_KEY || "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    // Verify caller is authenticated
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Create user using admin client
    let data, error;
    const createRes = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    data = { user: createRes.data.user };
    error = createRes.error;

    if (error) {
       throw error;
    }
    
    if (data.user) {
      await supabaseAdmin.from("user_profiles").upsert({
        id: data.user.id,
        email,
        role,
        airport_id,
        ai_daily_limit: 5,
        ai_weekly_limit: 20,
        ai_monthly_limit: 50,
        max_staff: 50,
        max_shifts: 20,
      });
    }
    
    res.status(200).json({ success: true, user: data.user });
  } catch (err: any) {
    console.error("Create user error:", err);
    res.status(400).json({ error: err.message });
  }
}
