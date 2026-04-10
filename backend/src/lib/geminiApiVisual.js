const { GoogleGenerativeAI } = require("@google/generative-ai");
const { parseDataUrlToInline, extractJsonObject, buildVisualPrompt } = require("./visualCommon");

/**
 * Google AI Studio / Gemini Developer API (API key only — no Vertex ADC).
 * Create a key: https://aistudio.google.com/apikey
 */
async function analyzeVisualGeminiApi({ apiKey, model, text, images }) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) throw new Error("analyzeVisualGeminiApi requires at least one image");
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("GEMINI_API_KEY is empty");

  const genAI = new GoogleGenerativeAI(key);
  const m = genAI.getGenerativeModel({
    model: String(model || "gemini-1.5-flash").trim(),
  });

  const parts = [{ text: buildVisualPrompt(text) }];
  for (const dataUrl of list.slice(0, 4)) {
    const { mimeType, data } = parseDataUrlToInline(dataUrl);
    parts.push({
      inlineData: {
        mimeType,
        data,
      },
    });
  }

  const result = await m.generateContent({
    contents: [{ role: "user", parts }],
  });

  let raw;
  try {
    raw = result.response.text();
  } catch (e) {
    const fb = result.response?.promptFeedback;
    throw new Error(
      `Gemini blocked or empty response: ${fb?.blockReason || e?.message || "unknown"}`
    );
  }
  if (!String(raw).trim()) {
    throw new Error("Gemini returned empty text");
  }

  const parsed = extractJsonObject(raw);
  const aiScore = Number(parsed.aiScore);
  const aiGeneratedProbability = Number(parsed.aiGeneratedProbability);
  const explanation = String(parsed.explanation || "");
  if (
    Number.isFinite(aiScore) &&
    Number.isFinite(aiGeneratedProbability) &&
    explanation
  ) {
    return { aiScore, aiGeneratedProbability, explanation, provider: "gemini" };
  }
  throw new Error("Gemini JSON missing aiScore / aiGeneratedProbability / explanation");
}

module.exports = { analyzeVisualGeminiApi };
