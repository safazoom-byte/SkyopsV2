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
    
    let caller = null;
    try {
      const { data, error } = await supabaseAnon.auth.getUser(token);
      if (!error && data?.user) {
        caller = data.user;
      }
    } catch (e) {}
    if (!caller) return res.status(401).json({ error: "Unauthorized" });
    
    const { profile } = req.body || {};
    if (!profile || !profile.id) return res.status(400).json({ error: "Missing profile or profile.id" });
    
    const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile) {
       return res.status(403).json({ error: "Forbidden: Caller profile not found" });
    }

    const isSelf = caller.id === profile.id;
    const isSuperAdmin = callerProfile.role === "super_admin";
    const isAdmin = callerProfile.role === "admin";
    
    if (!isSelf && !isSuperAdmin && !isAdmin) return res.status(403).json({ error: "Forbidden" });
    
    const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("*").eq("id", profile.id).maybeSingle();
    if (!targetProfile) {
       return res.status(404).json({ error: "Target profile not found" });
    }

    if (targetProfile.role === "super_admin" && !isSuperAdmin) {
       return res.status(403).json({ error: "Cannot modify super_admin profile" });
    }

    if (isAdmin && !isSuperAdmin && !isSelf && targetProfile.role !== "planner") {
       return res.status(403).json({ error: "Admins can only update planners" });
    }

    const sanitizedProfile: Record<string, any> = {
      id: profile.id,
      airport_id: profile.airport_id ?? targetProfile.airport_id,
      company_logo: profile.companyLogo ?? profile.company_logo ?? targetProfile.company_logo,
      skyops_logo: profile.skyopsLogo ?? profile.skyops_logo ?? targetProfile.skyops_logo,
      prepared_by: profile.preparedBy ?? profile.prepared_by ?? targetProfile.prepared_by,
      revised_by: profile.revisedBy ?? profile.revised_by ?? targetProfile.revised_by,
    };

    if (isSelf) {
      sanitizedProfile.email = targetProfile.email;
      sanitizedProfile.role = targetProfile.role;
      sanitizedProfile.is_active = targetProfile.is_active;
      sanitizedProfile.ai_daily_limit = targetProfile.ai_daily_limit;
      sanitizedProfile.ai_weekly_limit = targetProfile.ai_weekly_limit;
      sanitizedProfile.ai_monthly_limit = targetProfile.ai_monthly_limit;
      sanitizedProfile.max_staff = targetProfile.max_staff;
      sanitizedProfile.max_shifts = targetProfile.max_shifts;
    } else if (isSuperAdmin) {
      sanitizedProfile.email = profile.email ?? targetProfile.email;
      sanitizedProfile.role = profile.role ?? targetProfile.role;
      sanitizedProfile.is_active = profile.isActive ?? profile.is_active ?? targetProfile.is_active;
      sanitizedProfile.ai_daily_limit = profile.aiDailyLimit ?? profile.ai_daily_limit ?? targetProfile.ai_daily_limit;
      sanitizedProfile.ai_weekly_limit = profile.aiWeeklyLimit ?? profile.ai_weekly_limit ?? targetProfile.ai_weekly_limit;
      sanitizedProfile.ai_monthly_limit = profile.aiMonthlyLimit ?? profile.ai_monthly_limit ?? targetProfile.ai_monthly_limit;
      sanitizedProfile.max_staff = profile.maxStaff ?? profile.max_staff ?? targetProfile.max_staff;
      sanitizedProfile.max_shifts = profile.maxShifts ?? profile.max_shifts ?? targetProfile.max_shifts;
    } else if (isAdmin) {
      if (profile.role && profile.role !== "planner" && profile.role !== targetProfile.role) {
         return res.status(403).json({ error: "Admins can only assign the planner role" });
      }
      sanitizedProfile.email = profile.email ?? targetProfile.email;
      sanitizedProfile.role = profile.role ?? targetProfile.role;
      sanitizedProfile.is_active = profile.isActive ?? profile.is_active ?? targetProfile.is_active;
      sanitizedProfile.ai_daily_limit = profile.aiDailyLimit ?? profile.ai_daily_limit ?? targetProfile.ai_daily_limit;
      sanitizedProfile.ai_weekly_limit = profile.aiWeeklyLimit ?? profile.ai_weekly_limit ?? targetProfile.ai_weekly_limit;
      sanitizedProfile.ai_monthly_limit = profile.aiMonthlyLimit ?? profile.ai_monthly_limit ?? targetProfile.ai_monthly_limit;
      sanitizedProfile.max_staff = profile.maxStaff ?? profile.max_staff ?? targetProfile.max_staff;
      sanitizedProfile.max_shifts = profile.maxShifts ?? profile.max_shifts ?? targetProfile.max_shifts;
    }
    
    const { error } = await supabaseAdmin.from("user_profiles").upsert(sanitizedProfile);
    
    if (error) throw error;
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Update user error:", err);
    res.status(400).json({ error: "Something went wrong" });
  }
}
