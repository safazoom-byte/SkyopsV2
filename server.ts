import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", 1);

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    xFrameOptions: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:", "wss:", "ws:", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        workerSrc: ["'self'", "blob:"],
        frameAncestors: ["'self'", "https://ai.studio", "https://*.google.com"],
      },
    },
  }));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
  });
  app.use(globalLimiter);

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: "Too many AI generation requests, please try again later.",
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
  });

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  function getSupabaseConfig(requireServiceKey = false) {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_URL environment variable.");
    }
    if (!anonKey) {
      throw new Error("Missing SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY environment variable.");
    }
    if (requireServiceKey && !serviceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
    }
    return { url, anonKey, serviceKey: serviceKey as string };
  }

  const callAI = async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      const { url, anonKey } = getSupabaseConfig();
      const supabase = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      let user = null;
      try {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) {
          user = data.user;
        }
      } catch (e) {}

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
      if (!apiKey) {
        return res.status(400).json({ error: "API Key missing on server" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          baseUrl: "https://generativelanguage.googleapis.com",
        }
      });

      const prompt = req.body.prompt;
      if (!prompt) return res.status(400).json({ error: "Missing prompt" });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
      });

      res.json({ result: response.text });
    } catch (err: any) {
      console.error("AI Error:", err?.message || err);
      res.status(500).json({ error: "An error occurred while processing the request" });
    }
  };

  app.post("/api/gemini/generate", aiLimiter, callAI);

  
  app.post("/api/users/create", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      const { email, password, role, airport_id } = req.body;
      const { url, anonKey, serviceKey } = getSupabaseConfig(true);

      const supabaseAdmin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const supabaseAnon = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let caller = null;
      try {
        const { data, error } = await supabaseAnon.auth.getUser(token);
        if (!error && data?.user) {
          caller = data.user;
        }
      } catch (e) {}

      if (!caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
      if (!callerProfile || (callerProfile.role !== "super_admin" && callerProfile.role !== "admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      if (callerProfile.role === "admin" && role !== "planner") {
        return res.status(403).json({ error: "Admins can only create planners" });
      }
            
      let userId;
      let userObj;
      const createRes = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createRes.error) {
        if (createRes.error.message.includes("already been registered") || createRes.error.message.includes("already exists")) {
          // Find the user ID
          const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === email);
          if (existingUser) {
            userId = existingUser.id;
            userObj = existingUser;
            // Optionally update password if needed
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
          id: userId,
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
      res.json({ success: true, user: userObj });
    } catch (err: any) {
      console.error("Create user error:", err?.message || err);
      res.status(400).json({ error: "An error occurred while creating the user" });
    }
  });

  
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
      
      const { url, anonKey, serviceKey } = getSupabaseConfig(true);
      
      const supabaseAdmin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const supabaseAnon = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      
      let caller = null;
      try {
        const { data, error } = await supabaseAnon.auth.getUser(token);
        if (!error && data?.user) {
          caller = data.user;
        }
      } catch (e) {}

      if (!caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { data: callerProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", caller.id).single();
      if (!callerProfile) {
         return res.status(403).json({ error: "Forbidden: Caller profile not found" });
      }

      const isSelf = caller.id === profile.id;
      const isSuperAdmin = callerProfile.role === "super_admin";
      const isAdmin = callerProfile.role === "admin";
      
      if (!isSelf && !isSuperAdmin && !isAdmin) {
         return res.status(403).json({ error: "Forbidden" });
      }

      const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("*").eq("id", profile.id).maybeSingle();
      if (!targetProfile) {
         return res.status(404).json({ error: "Target profile not found" });
      }

      // Protection: Non-super admins cannot modify a super_admin profile
      if (targetProfile.role === "super_admin" && !isSuperAdmin) {
         return res.status(403).json({ error: "Cannot modify super_admin profile" });
      }

      // Protection: Admins updating non-self must only update planners
      if (isAdmin && !isSuperAdmin && !isSelf && targetProfile.role !== "planner") {
         return res.status(403).json({ error: "Admins can only update planners" });
      }

      // Build sanitized profile object based on role privileges
      const sanitizedProfile: Record<string, any> = {
        id: profile.id,
        airport_id: profile.airport_id ?? targetProfile.airport_id,
        company_logo: profile.companyLogo ?? profile.company_logo ?? targetProfile.company_logo,
        skyops_logo: profile.skyopsLogo ?? profile.skyops_logo ?? targetProfile.skyops_logo,
        prepared_by: profile.preparedBy ?? profile.prepared_by ?? targetProfile.prepared_by,
        revised_by: profile.revisedBy ?? profile.revised_by ?? targetProfile.revised_by,
      };

      if (isSelf) {
        // Self-edit (for ANY role, including admin and super_admin):
        // Strictly preserve email, role, is_active, and all resource limits from targetProfile
        sanitizedProfile.email = targetProfile.email;
        sanitizedProfile.role = targetProfile.role;
        sanitizedProfile.is_active = targetProfile.is_active;
        sanitizedProfile.ai_daily_limit = targetProfile.ai_daily_limit;
        sanitizedProfile.ai_weekly_limit = targetProfile.ai_weekly_limit;
        sanitizedProfile.ai_monthly_limit = targetProfile.ai_monthly_limit;
        sanitizedProfile.max_staff = targetProfile.max_staff;
        sanitizedProfile.max_shifts = targetProfile.max_shifts;
      } else if (isSuperAdmin) {
        // Super Admin updating another user
        sanitizedProfile.email = profile.email ?? targetProfile.email;
        sanitizedProfile.role = profile.role ?? targetProfile.role;
        sanitizedProfile.is_active = profile.isActive ?? profile.is_active ?? targetProfile.is_active;
        sanitizedProfile.ai_daily_limit = profile.aiDailyLimit ?? profile.ai_daily_limit ?? targetProfile.ai_daily_limit;
        sanitizedProfile.ai_weekly_limit = profile.aiWeeklyLimit ?? profile.ai_weekly_limit ?? targetProfile.ai_weekly_limit;
        sanitizedProfile.ai_monthly_limit = profile.aiMonthlyLimit ?? profile.ai_monthly_limit ?? targetProfile.ai_monthly_limit;
        sanitizedProfile.max_staff = profile.maxStaff ?? profile.max_staff ?? targetProfile.max_staff;
        sanitizedProfile.max_shifts = profile.maxShifts ?? profile.max_shifts ?? targetProfile.max_shifts;
      } else if (isAdmin) {
        // Non-super Admin updating another user (target is guaranteed to be a planner)
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
      
      if (error) {
         throw error;
      }
      
      res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Update user error:", err?.message || err);
      res.status(400).json({ error: "An error occurred while updating the user profile" });
    }
  });

  app.post("/api/users/delete", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      const { url, anonKey, serviceKey } = getSupabaseConfig(true);

      const supabaseAdmin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const supabaseAnon = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let caller = null;
      try {
        const { data, error } = await supabaseAnon.auth.getUser(token);
        if (!error && data?.user) {
          caller = data.user;
        }
      } catch (e) {}

      if (!caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }

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
    } catch (err: any) {
      console.error("Delete user error:", err?.message || err);
      res.status(400).json({ error: "An error occurred while deleting the user" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
