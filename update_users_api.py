with open("api/users/create.ts", "w") as f:
    f.write("""import { createClient } from "@supabase/supabase-js";

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
    const supabaseAnon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) return res.status(401).json({ error: "Unauthorized" });
    
    const { email, password, role, airport_id } = req.body || {};
    
    const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || (callerProfile.role !== "super_admin" && callerProfile.role !== "admin")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    if (callerProfile.role === "admin" && role !== "planner") {
      return res.status(403).json({ error: "Admins can only create planners" });
    }
        
    let userId;
    let userObj;
    const createRes = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createRes.error) {
      if (createRes.error.message.includes("already been registered") || createRes.error.message.includes("already exists")) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users?.find(u => u.email === email);
        if (existingUser) {
          userId = existingUser.id;
          userObj = existingUser;
          await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        } else {
          throw createRes.error;
        }
      } else {
        throw createRes.error;
      }
    } else {
      userId = createRes.data.user.id;
      userObj = createRes.data.user;
    }
    
    if (userObj) {
      await supabaseAdmin.from("user_profiles").upsert({
        id: userId, email, role, airport_id, ai_daily_limit: 5, ai_weekly_limit: 20, ai_monthly_limit: 50, max_staff: 50, max_shifts: 20,
      });
    }
    res.status(200).json({ success: true, user: userObj });
  } catch (err: any) {
    console.error("Create user error:", err);
    res.status(400).json({ error: "Something went wrong" });
  }
}
""")

with open("api/users/delete.ts", "w") as f:
    f.write("""import { createClient } from "@supabase/supabase-js";

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
    const supabaseAnon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) return res.status(401).json({ error: "Unauthorized" });
    
    // Check caller role
    const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || (callerProfile.role !== "super_admin" && callerProfile.role !== "admin")) {
        return res.status(403).json({ error: "Forbidden" });
    }
    
    const { id, email } = req.body || {};
    if (!id) return res.status(400).json({ error: "User ID is required" });
    
    // Prevent deleting safazoom
    if (email === "safazoom@gmail.com") {
      return res.status(403).json({ error: "Cannot delete master user" });
    }
    
    if (callerProfile.role === "admin") {
       const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", id).single();
       if (targetProfile && targetProfile.role !== "planner") {
          return res.status(403).json({ error: "Admins can only delete planners" });
       }
    }
    
    // Delete from auth first, which might cascade depending on setup, but we'll manually delete profile just in case
    await supabaseAdmin.auth.admin.deleteUser(id);
    await supabaseAdmin.from("user_profiles").delete().eq("id", id);
    
    res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Delete user error:", err);
    res.status(400).json({ error: "VercelAPI: Something went wrong" });
  }
}
""")
