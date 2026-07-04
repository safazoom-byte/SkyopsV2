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
        frameAncestors: ["'*'", "*", "https:"],
      },
    },
  }));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(globalLimiter);

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: "Too many AI generation requests, please try again later.",
  });

  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const callAI = async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL || "",
        process.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
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
      console.error("AI Error:", err);
      res.status(500).json({ error: "Something went wrong" });
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
    } catch (err) {
      console.error("Create user error:", err);
      res.status(400).json({ error: "Something went wrong" });
    }
  });

  app.post("/api/users/delete", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = authHeader.split(" ")[1];
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
      if (!callerProfile || (callerProfile.role !== "super_admin" && callerProfile.role !== "admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { id, email } = req.body;
      if (!id) return res.status(400).json({ error: "User ID is required" });
      if (email === "safazoom@gmail.com") return res.status(403).json({ error: "Cannot delete master user" });

      if (callerProfile.role === "admin") {
         const { data: targetProfile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", id).single();
         if (targetProfile && targetProfile.role !== "planner") {
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
