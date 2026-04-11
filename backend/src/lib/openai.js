const axios = require("axios");

/** Infer data URL mime type from base64-decoded magic bytes (OpenAI accepts jpeg/png/webp/gif). */
function mimeFromBase64(imageBase64) {
  try {
    const buf = Buffer.from(String(imageBase64).slice(0, 96), "base64");
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf.length >= 2 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
    if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
    if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
      return "image/webp";
  } catch {
    /* ignore */
  }
  return "image/jpeg";
}

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

function mockCheckAiVision(imageBase64Length) {
  const n = Math.max(1, Number(imageBase64Length) || 1);
  const aiProbability = 18 + (n % 73);
  const verdict = aiProbability >= 52 ? "AI-generated" : "Real";
  const explanation =
    verdict === "AI-generated"
      ? "No API key: mock response. Set OPENAI_API_KEY for real vision analysis. Image payload received."
      : "No API key: mock response. Set OPENAI_API_KEY for real vision analysis. Image payload received.";
  return { aiProbability, verdict, explanation };
}

async function openAiCheckAiVision({ apiKey, model, imageBase64 }) {
  const prompt = [
    "You assess whether a social media image is likely AI-generated (synthetic) versus a real photograph or screenshot of real content.",
    "Consider: anatomy/face hands, lighting consistency, text artifacts, texture repetition, watermark patterns, and typical diffusion glitches.",
    "Return STRICT JSON ONLY with keys:",
    'aiProbability (integer 0-100, estimated chance the image is AI-generated),',
    'verdict (string: exactly "Real" or exactly "AI-generated" — pick the more likely),',
    "explanation (string, 1-3 short sentences, plain English).",
  ].join("\n");

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Return strict JSON only. No markdown." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeFromBase64(imageBase64)};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
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

function normalizeVerdict(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "real") return "Real";
  if (s === "ai-generated" || s === "ai generated" || /^ai[- ]?generated/.test(s)) return "AI-generated";
  return null;
}

async function checkAiVision({ apiKey, model, imageBase64 }) {
  if (!apiKey) return mockCheckAiVision(String(imageBase64 || "").length);
  try {
    const res = await openAiCheckAiVision({ apiKey, model, imageBase64 });
    let aiProbability = Math.round(Number(res.aiProbability));
    if (!Number.isFinite(aiProbability)) aiProbability = 50;
    aiProbability = Math.max(0, Math.min(100, aiProbability));
    let verdict = normalizeVerdict(res.verdict);
    if (!verdict) verdict = aiProbability >= 50 ? "AI-generated" : "Real";
    const explanation = String(res.explanation || "No explanation provided.").trim();
    return { aiProbability, verdict, explanation };
  } catch {
    return mockCheckAiVision(String(imageBase64 || "").length);
  }
}

module.exports = { analyzeText, checkAiVision };
