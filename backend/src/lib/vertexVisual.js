const { VertexAI } = require("@google-cloud/vertexai");
const { parseDataUrlToInline, extractJsonObject, buildVisualPrompt } = require("./visualCommon");

/**
 * Reel visual analysis via Vertex AI Gemini (multimodal).
 * Auth: Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud auth application-default login).
 */
async function analyzeVisualVertex({ project, location, model, text, images }) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) throw new Error("analyzeVisualVertex requires at least one image");
  if (!project || !String(project).trim()) {
    throw new Error("VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT is required for Vertex visual analysis");
  }

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
