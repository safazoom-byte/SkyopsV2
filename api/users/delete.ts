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
    
    const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || (callerProfile.role !== "super_admin" && callerProfile.role !== "admin")) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID is required" });

    const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", id).maybeSingle();
    if (!targetProfile) {
       return res.status(404).json({ error: "Target profile not found" });
    }

    if (targetProfile.role === "super_admin" && callerProfile.role !== "super_admin") {
       return res.status(403).json({ error: "Cannot delete super_admin user" });
    }

    if (callerProfile.role === "admin") {
       if (targetProfile.role !== "planner") {
          return res.status(403).json({ error: "Admins can only delete planners" });
       }
    }
    
    await supabaseAdmin.auth.admin.deleteUser(id);
    await supabaseAdmin.from("user_profiles").delete().eq("id", id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(400).json({ error: "Something went wrong" });
  }
}
