import re

with open("server.ts", "r") as f:
    code = f.read()

update_route = """
  app.post("/api/users/update", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      const { profile } = req.body;
      if (!profile || !profile.id) {
         return res.status(400).json({ error: "Missing profile or profile.id" });
      }
      
      const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!hasServiceKey) {
        return res.status(400).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
      }
      
      const supabaseAdmin = require("@supabase/supabase-js").createClient(
        process.env.VITE_SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      
      const supabaseAnon = require("@supabase/supabase-js").createClient(
        process.env.VITE_SUPABASE_URL || "",
        process.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      
      const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
      if (authError || !caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
      
      // Allow if caller is super_admin, or if caller is admin updating a planner, OR if caller is updating themselves
      const isSelf = caller.id === profile.id;
      const isSuperAdmin = callerProfile?.role === "super_admin";
      const isAdmin = callerProfile?.role === "admin";
      
      if (!isSelf && !isSuperAdmin && !isAdmin) {
         return res.status(403).json({ error: "Forbidden" });
      }
      
      if (isAdmin && !isSuperAdmin && !isSelf) {
         // Admins can only update planners
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
      
      if (error) {
         throw error;
      }
      
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Update user error:", err);
      res.status(400).json({ error: "Something went wrong" });
    }
  });
"""

code = code.replace('app.post("/api/users/delete", async (req, res) => {', update_route + '\n  app.post("/api/users/delete", async (req, res) => {')

with open("server.ts", "w") as f:
    f.write(code)
