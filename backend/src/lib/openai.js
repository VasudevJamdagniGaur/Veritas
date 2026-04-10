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

module.exports = { analyzeText };

