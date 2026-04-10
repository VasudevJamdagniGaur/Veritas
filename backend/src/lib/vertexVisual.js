const { VertexAI } = require("@google-cloud/vertexai");

function parseDataUrlToInline(dataUrl) {
  const s = String(dataUrl);
  const idx = s.indexOf("base64,");
  if (idx === -1) throw new Error("Image must be a base64 data URL");
  const meta = s.slice(5, idx - 1);
  const mimeType = (meta.split(";")[0] || "image/jpeg").trim() || "image/jpeg";
  const data = s.slice(idx + 7);
  if (!data) throw new Error("Empty image payload");
  return { mimeType, data };
}

function extractJsonObject(text) {
  const content = String(text || "");
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Model returned non-JSON text");
  }
  return JSON.parse(content.slice(firstBrace, lastBrace + 1));
}

function buildVisualPrompt(caption) {
  const c = String(caption || "").trim();
  return [
    "You are Veritas, a trust layer for social media.",
    "You receive still frame(s) from a short vertical video (Reel-style).",
    "Judge whether the visuals look like REAL camera footage of humans and real environments versus AI-generated or synthetic video (deepfakes, full-AI humans, uncanny CGI, obvious GAN/diffusion artifacts).",
    "Still frames are weak evidence—be calibrated; say when uncertain.",
    "Return STRICT JSON ONLY (no markdown fences) with keys:",
    "aiScore (0-100, higher = more credible / likely authentic human footage),",
    "aiGeneratedProbability (0-1, higher = more likely synthetic or AI-generated visuals),",
    "explanation (2-4 sentences: cite visible cues like skin/eyes/hands, lighting, motion blur, warping).",
    c ? `\nOPTIONAL CAPTION / ON-PAGE TEXT:\n${c}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Reel visual analysis via Vertex AI Gemini (multimodal).
 * Auth: Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login).
 *
 * @param {{ project: string, location: string, model: string, text?: string, images: string[] }} opts
 */
async function analyzeVisualVertex({ project, location, model, text, images }) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) throw new Error("analyzeVisualVertex requires at least one image");
  if (!project || !String(project).trim()) throw new Error("VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT is required for Vertex visual analysis");

  const vertexAI = new VertexAI({
    project: String(project).trim(),
    location: String(location || "us-central1").trim(),
  });

  const generativeModel = vertexAI.getGenerativeModel({
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

  const result = await generativeModel.generateContent({
    contents: [{ role: "user", parts }],
  });

  const candidate = result?.response?.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    const blocked = result?.response?.promptFeedback?.blockReason;
    const msg = blocked || "no candidates";
    throw new Error(`Vertex Gemini returned no content (${msg}).`);
  }

  const raw = candidate.content.parts.map((p) => p.text || "").join("");
  if (!String(raw).trim()) {
    throw new Error(
      `Vertex Gemini returned empty text (finishReason=${candidate.finishReason || "unknown"})`
    );
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
    return { aiScore, aiGeneratedProbability, explanation, provider: "vertex" };
  }
  throw new Error("Vertex Gemini JSON missing aiScore / aiGeneratedProbability / explanation");
}

module.exports = { analyzeVisualVertex, parseDataUrlToInline };
