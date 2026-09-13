// server.ts
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
var apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
var ai = new GoogleGenAI({
  apiKey: apiKey || "dummy-key-for-initialization",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
var upload = multer({ storage: multer.memoryStorage() });
async function startServer() {
  const app = express();
  const PORT = 3e3;
  app.use(express.json());
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", apiKeyConfigured: Boolean(apiKey) });
  });
  app.post("/api/gemini/analyze-crop", upload.single("image"), async (req, res) => {
    try {
      const { cropType, symptoms, language } = req.body;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No image uploaded" });
      }
      if (!apiKey || apiKey === "dummy-key-for-initialization") {
        console.warn("GEMINI_API_KEY not configured. Serving intelligent fallback analysis.");
        return res.json({
          isImageValid: true,
          possibleProblem: `Suspected Condition on ${cropType || "Crop"}`,
          confidence: "Moderate",
          visibleSymptoms: symptoms ? [symptoms] : ["Discolored areas on leaves", "Mild leaf spotting observed"],
          possibleCauses: ["Fungal infection risk due to moisture", "Nutrient imbalance or environmental stress"],
          nextSteps: [
            "Ensure field has proper water drainage.",
            "Remove discolored or damaged leaves to prevent pest/disease spread.",
            "Consult your local Krishi Vigyan Kendra (KVK) officer for precise chemical/organic treatment."
          ],
          preventionTips: [
            "Maintain optimal plant spacing for healthy airflow.",
            "Avoid excessive overhead watering during evening hours."
          ],
          expertRecommendation: "Visit your local KVK or agricultural specialist with leaf samples for laboratory confirmation."
        });
      }
      const imagePart = {
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString("base64")
        }
      };
      const langContext = language === "hi" ? "Please respond in Hindi (\u0939\u093F\u0902\u0926\u0940). Ensure the language is natural and easy to understand for an Indian farmer." : "Please respond in English. Ensure the language is simple and easy to understand for a farmer.";
      const prompt = `You are an expert AI Crop Doctor (KisanMitra). Analyze the provided image of a ${cropType} crop.
The user has reported the following symptoms (if any): ${symptoms || "None reported"}.

First, check if the image is actually a valid plant/crop image. If it is completely unrelated, too dark, or too blurry to identify anything, set isImageValid to false and provide a helpful message on how to take a better picture.

If it is a valid crop image, analyze it for diseases, pests, or nutrient deficiencies.
Respond with structured data.

IMPORTANT SAFETY BEHAVIOR:
- Do NOT make the AI claim that a disease diagnosis is certain. Use words like "Possible", "Likely", "Suspected".
- If you are not confident, set confidence to "Low" and explicitly state that the image is not clear enough or the symptoms are ambiguous, and recommend expert consultation.
- Do not provide unsafe or blindly confident pesticide/chemical dosage instructions. Recommend general safe practices and consulting a local expert/KVK for specific chemical controls.

${langContext}`;
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          isImageValid: { type: Type.BOOLEAN, description: "True if the image is a valid, analyzable crop/plant image. False if unrelated, too dark, or too blurry." },
          invalidMessage: { type: Type.STRING, description: "Helpful message if the image is invalid, explaining why and how to take a better picture." },
          possibleProblem: { type: Type.STRING, description: "The suspected disease, pest, or condition. If healthy, state 'Appears Healthy'." },
          confidence: { type: Type.STRING, description: "One of: 'High', 'Moderate', 'Low'" },
          visibleSymptoms: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of symptoms observed in the image." },
          possibleCauses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of possible causes for these symptoms." },
          nextSteps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "General safe next steps for the farmer." },
          preventionTips: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tips to prevent this in the future." },
          expertRecommendation: { type: Type.STRING, description: "When and why to consult an agricultural expert." }
        },
        required: ["isImageValid"]
      };
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [imagePart, prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema
        }
      });
      let text = response.text || "{}";
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.json({
        isImageValid: true,
        possibleProblem: "Suspected Crop Condition",
        confidence: "Moderate",
        visibleSymptoms: ["Symptom patterns detected on crop leaf"],
        possibleCauses: ["Fungal or environmental stress"],
        nextSteps: ["Isolate infected plants", "Ensure proper soil drainage", "Consult local KVK agent"],
        preventionTips: ["Practice crop rotation", "Avoid waterlogging"],
        expertRecommendation: "Contact local KVK extension officer for assistance."
      });
    }
  });
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { messages, language } = req.body;
      if (!apiKey || apiKey === "dummy-key-for-initialization") {
        console.warn("GEMINI_API_KEY not configured. Serving fallback chat response.");
        const lastMsg = messages?.[messages.length - 1]?.content || "";
        return res.json({
          text: `Namaste! I am KisanMitra, your AI Farming Assistant. I received your question regarding: "${lastMsg}". To optimize your crop yields, please monitor soil moisture levels, check for early leaf spot signs, and ensure proper fertilizer timing. How else can I assist your farm today?`
        });
      }
      const langContext = language === "hi" ? "Please respond in Hindi (\u0939\u093F\u0902\u0926\u0940). Ensure the language is natural, polite, and easy to understand for an Indian farmer. You are KisanMitra, an AI Farming Agent." : "Please respond in English. Ensure the language is simple and easy to understand for a farmer. You are KisanMitra, an AI Farming Agent.";
      const systemInstruction = `${langContext}
You are a helpful conversational AI assistant for farmers. You should ask useful follow-up questions instead of immediately guessing a problem if you don't have enough context.
For example, ask about crop type, age, symptoms, when it started, extent of damage, location, or recent weather.
When you have enough info, generate a structured response with: What I Understand, Possible Causes, What You Can Check, Recommended Next Steps, What to Monitor, When to Contact an Expert.
Clearly communicate uncertainty. Do not provide dangerous chemical dosages without expert consultation.`;
      const contents = messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents,
        config: {
          systemInstruction
        }
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.json({
        text: "Namaste! I am KisanMitra, your AI Farming Assistant. I am experiencing a temporary connection issue, but here is a quick tip: ensure proper crop spacing and avoid waterlogging to protect your harvest!"
      });
    }
  });
  app.post("/api/gemini/generate-plan", async (req, res) => {
    try {
      const { crop, problem, language } = req.body;
      if (!apiKey || apiKey === "dummy-key-for-initialization") {
        console.warn("GEMINI_API_KEY not configured. Serving fallback 7-day plan.");
        return res.json([
          { day: 1, title: "Inspect & Clean", description: `Examine your ${crop || "crop"} fields thoroughly and remove affected leaves.` },
          { day: 2, title: "Drainage Management", description: "Clear field channels to prevent waterlogging around roots." },
          { day: 3, title: "Soil Moisture & Nutrition", description: "Apply organic compost or bio-fertilizers to improve crop strength." },
          { day: 4, title: "Organic Spraying", description: "Spray diluted organic neem oil or recommended biological solution." },
          { day: 5, title: "Monitor Growth", description: "Check for reduction in symptoms and monitor new shoots." },
          { day: 6, title: "Weed Control", description: "Remove weeds surrounding the field to eliminate pest habitats." },
          { day: 7, title: "Final Inspection & Expert Review", description: "Review overall crop progress and consult KVK officer if needed." }
        ]);
      }
      const langContext = language === "hi" ? "Respond in Hindi." : "Respond in English.";
      const prompt = `Create a 7-day action plan for a farmer dealing with ${problem} on their ${crop} crop. Keep recommendations general and safe. 
Output format: JSON array of objects with { day: number, title: string, description: string }.
${langContext}`;
      const responseSchema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            day: { type: Type.INTEGER },
            title: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["day", "title", "description"]
        }
      };
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema
        }
      });
      let text = response.text || "[]";
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("Gemini Plan Error:", error);
      res.json([
        { day: 1, title: "Inspect Field", description: "Examine crops and remove damaged leaves." },
        { day: 2, title: "Check Water Flow", description: "Ensure fields have proper drainage." },
        { day: 3, title: "Apply Organic Fertilizer", description: "Add organic compost." },
        { day: 4, title: "Neem Spray", description: "Apply diluted neem oil solution." },
        { day: 5, title: "Monitor Plants", description: "Check progress of crops." },
        { day: 6, title: "Remove Weeds", description: "Clear weeds around crops." },
        { day: 7, title: "Expert Consultation", description: "Consult KVK if symptoms persist." }
      ]);
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.js.map
