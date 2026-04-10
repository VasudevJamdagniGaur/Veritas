function parseDataUrlToInline(dataUrl) {
  const s = String(dataUrl);
  const idx = s.indexOf("base64,");
  if (idx === -1) throw new Error("Image must be a base64 data URL");
  const meta = s.slice(5, idx - 1);
  const mimeType = (meta.split(";")[0] || "image/jpeg").trim() || "image/jpeg";
  const data = s.slice(idx + 7).replace(/\s/g, "");
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

module.exports = { parseDataUrlToInline, extractJsonObject, buildVisualPrompt };
