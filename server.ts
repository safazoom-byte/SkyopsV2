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
    contentSecurityPolicy: false,
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
      res.status(500).json({ error: err.message });
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
      const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
      if (authError || !caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const createRes = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createRes.error) {
        throw createRes.error;
      }
      if (createRes.data.user) {
        await supabaseAdmin.from("user_profiles").upsert({
          id: createRes.data.user.id,
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
      res.json({ success: true, user: createRes.data.user });
    } catch (err: any) {
      console.error("Create user error:", err);
      res.status(400).json({ error: err.message });
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
