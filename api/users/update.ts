import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const token = authHeader.split(" ")[1];
    
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    
    if (!serviceKey) return res.status(400).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    
    const supabaseAdmin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const supabaseAnon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) return res.status(401).json({ error: "Unauthorized" });
    
    const { profile } = req.body || {};
    if (!profile || !profile.id) return res.status(400).json({ error: "Missing profile or profile.id" });
    
    const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
    
    const isSelf = caller.id === profile.id;
    const isSuperAdmin = callerProfile?.role === "super_admin";
    const isAdmin = callerProfile?.role === "admin";
    
    if (!isSelf && !isSuperAdmin && !isAdmin) return res.status(403).json({ error: "Forbidden" });
    if (profile.email === "safazoom@gmail.com" && caller.email !== "safazoom@gmail.com") {
        return res.status(403).json({ error: "Cannot modify master user" });
    }
    
    if (isAdmin && !isSuperAdmin && !isSelf) {
       const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", profile.id).single();
       if (targetProfile && targetProfile.role !== "planner") {
          return res.status(403).json({ error: "Admins can only update planners" });
       }
    }
    
    const { error } = await supabaseAdmin.from("user_profiles").upsert({
        id: profile.id,
        email: profile.email,
        role: profile.role,
        airport_id: profile.airport_id,
        ai_daily_limit: profile.aiDailyLimit,
        ai_weekly_limit: profile.aiWeeklyLimit,
        ai_monthly_limit: profile.aiMonthlyLimit,
        max_staff: profile.maxStaff,
        max_shifts: profile.maxShifts,
        is_active: profile.isActive,
        company_logo: profile.companyLogo,
        skyops_logo: profile.skyopsLogo,
        prepared_by: profile.preparedBy,
        revised_by: profile.revisedBy,
    });
    
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Update user error:", err);
    res.status(400).json({ error: "Something went wrong" });
  }
}
