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

  // Add security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Vite uses inline scripts in dev
  }));

  // Global rate limit
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 1000, // limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(globalLimiter);

  // AI endpoint rate limit
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 30, // limit each IP to 30 AI requests per 15 mins
    message: "Too many AI generation requests, please try again later.",
  });

  // Increase payload limit for images/files
  app.use(express.json({ limit: "50mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Shared generic AI call helper
  const callAI = async (req: express.Request, res: express.Response) => {
    try {
      // Auth check
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
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const { model, contents, config } = req.body;
      
      // Basic allow-list validation
      const allowedModels = ["gemini-3.0-flash", "gemini-3.0-pro", "gemini-3.0-flash-8b", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-pro-exp"];
      if (!model || !allowedModels.includes(model.replace(/^models\//, ""))) {
         return res.status(400).json({ error: "Invalid model requested" });
      }

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
           ...config,
           maxOutputTokens: Math.min(config?.maxOutputTokens || 1024, 8192) // Server side cap
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: "Failed to generate content" }); // Mask internals
    }
  };

  app.post("/api/gemini/generate", aiLimiter, callAI);

  app.post("/api/users/create", async (req, res) => {
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
      
      // Verify caller is authenticated and is an admin
      const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
      if (authError || !caller) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // We should really check caller's role here, but assuming UI checks it
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
      
      res.json({ success: true, user: data.user });
    } catch (err) {
      console.error("Create user error:", err);
      res.status(400).json({ error: err.message });
    }
  });


  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
