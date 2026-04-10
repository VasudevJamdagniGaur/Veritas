const axios = require("axios");

function looksLikeMisinformation(text) {
  const t = String(text || "").toLowerCase();
  const flags = [
    "cure",
    "miracle",
    "secret",
    "they don't want you to know",
    "hoax",
    "flat earth",
    "5g",
    "microchip",
    "vaccine",
    "rigged",
    "stolen election",
    "crisis actor",
  ];
  return flags.some((f) => t.includes(f));
}

function looksAiGenerated(text) {
  const t = String(text || "");
  // Tiny heuristic: repetitive filler + overly formal phrasing.
  const patterns = [
    /as an ai/i,
    /in conclusion/i,
    /overall[, ]/i,
    /it is important to note/i,
    /furthermore/i,
    /moreover/i,
  ];
  return patterns.some((p) => p.test(t)) || t.length > 280;
}

function mockAnalyze(text) {
  const misinfo = looksLikeMisinformation(text);
  const aiLike = looksAiGenerated(text);

  let aiScore = 78;
  let aiGeneratedProbability = aiLike ? 0.72 : 0.22;
  let explanation =
    "The content appears consistent with typical human-authored posts and contains no strong indicators of manipulation.";

  if (misinfo) {
    aiScore = 28;
    explanation =
      "This claim shows common misinformation signals (sensational framing and unverifiable assertions). Consider checking reputable sources and primary evidence.";
  } else if (aiLike) {
    aiScore = 55;
    explanation =
      "The writing style has patterns often seen in AI-generated text (overly structured phrasing and generic transitions).";
  }

  return {
    aiScore,
    aiGeneratedProbability,
    explanation,
  };
}

async function openAiAnalyze({ apiKey, model, text }) {
  // Use a simple, robust Chat Completions call via HTTPS.
  // We expect a strict JSON response.
  const prompt = [
    "You are Veritas, a trust layer for social media.",
    "Analyze the given post text for credibility and whether it is likely AI-generated.",
    "Return STRICT JSON ONLY with keys:",
    "aiScore (0-100), aiGeneratedProbability (0-1), explanation (string, 1-2 sentences).",
    "Be cautious and realistic.",
    "",
    `TEXT:\n${text}`,
  ].join("\n");

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    }
  );

  const content = resp.data?.choices?.[0]?.message?.content ?? "";
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("OpenAI returned non-JSON content");
  }
  const json = JSON.parse(content.slice(firstBrace, lastBrace + 1));
  return json;
}

async function analyzeText({ apiKey, model, text }) {
  if (!apiKey) return mockAnalyze(text);
  try {
    const res = await openAiAnalyze({ apiKey, model, text });
    const aiScore = Number(res.aiScore);
    const aiGeneratedProbability = Number(res.aiGeneratedProbability);
    const explanation = String(res.explanation || "");
    if (
      Number.isFinite(aiScore) &&
      Number.isFinite(aiGeneratedProbability) &&
      explanation
    ) {
      return { aiScore, aiGeneratedProbability, explanation };
    }
    return mockAnalyze(text);
  } catch {
    return mockAnalyze(text);
  }
}

function mockAnalyzeVisual(text, imageCount) {
  const snippet = String(text || "").slice(0, 160);
  return {
    aiScore: 55,
    aiGeneratedProbability: 0.45,
    explanation: `No OPENAI_API_KEY (or REACT_APP_OPENAI_API_KEY) in backend/.env — mock only. Add your key, restart the server, use a vision model (e.g. gpt-4o-mini). ${imageCount} frame(s). Caption: ${snippet || "(none)"}`,
  };
}

/**
 * Vision path: still frames from the reel + optional caption (Chat Completions multimodal).
 * Requires a vision-capable OPENAI_MODEL (e.g. gpt-4o-mini, gpt-4o).
 */
async function openAiAnalyzeVisual({ apiKey, model, text, imageDataUrls }) {
  const caption = String(text || "").trim();
  const prompt = [
    "You are Veritas, a trust layer for social media.",
    "You receive still frame(s) from a short vertical video (Reel-style).",
    "Judge whether the visuals look like REAL camera footage of humans and real environments versus AI-generated or synthetic video (deepfakes, full-AI humans, uncanny CGI, obvious GAN/diffusion artifacts).",
    "Still frames are weak evidence—be calibrated; say when uncertain.",
    "Return STRICT JSON ONLY with keys:",
    "aiScore (0-100, higher = more credible / likely authentic human footage),",
    "aiGeneratedProbability (0-1, higher = more likely synthetic or AI-generated visuals),",
    "explanation (2-4 sentences: cite visible cues like skin/eyes/hands, lighting consistency, motion blur, warping, text/UI in frame).",
    caption ? `\nOPTIONAL CAPTION / ON-PAGE TEXT:\n${caption}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = [
    { type: "text", text: prompt },
    ...imageDataUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: "low" },
    })),
  ];

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 600,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    }
  );

  const content = resp.data?.choices?.[0]?.message?.content ?? "";
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("OpenAI returned non-JSON content for vision request");
  }
  return JSON.parse(content.slice(firstBrace, lastBrace + 1));
}

/**
 * @param {{ apiKey: string, model: string, text?: string, images: string[] }} opts
 * images = data URLs (data:image/jpeg;base64,...)
 */
async function analyzeVisual({ apiKey, model, text, images }) {
  const imageDataUrls = Array.isArray(images) ? images : [];
  if (imageDataUrls.length === 0) {
    throw new Error("analyzeVisual requires at least one image");
  }
  if (!apiKey) return mockAnalyzeVisual(text, imageDataUrls.length);

  const res = await openAiAnalyzeVisual({
    apiKey,
    model,
    text: text || "",
    imageDataUrls,
  });
  const aiScore = Number(res.aiScore);
  const aiGeneratedProbability = Number(res.aiGeneratedProbability);
  const explanation = String(res.explanation || "");
  if (
    Number.isFinite(aiScore) &&
    Number.isFinite(aiGeneratedProbability) &&
    explanation
  ) {
    return { aiScore, aiGeneratedProbability, explanation };
  }
  throw new Error("Vision model returned an invalid JSON shape");
}

module.exports = { analyzeText, analyzeVisual, mockAnalyzeVisual };

