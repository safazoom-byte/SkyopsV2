import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  // Allow CORS if needed, though usually same-origin on Vercel
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

    res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
}
