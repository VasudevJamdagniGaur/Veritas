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
    "Analyze the given post text for credibility.",
    "Judge whether it reads as authentic human-written content (including casual, conversational, personal, or informal phrasing that might resemble notes or handwritten tone) versus likely AI-generated or heavily templated machine text.",
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

function mockAmazonReviewsTrust(previewLen) {
  const n = Math.max(1, Number(previewLen) || 1);
  const trustScore = 38 + (n % 52);
  const verdict = trustScore >= 70 ? "Highly Trustworthy" : trustScore >= 45 ? "Mixed Signals" : "Suspicious";
  return {
    trustScore,
    verdict,
    summary:
      "No API key: mock response. Set OPENAI_API_KEY in backend/.env for real review-trust analysis. Payload length was used only to vary the demo score.",
    issues: ["OPENAI_API_KEY not configured (mock mode)"],
  };
}

async function openAiAmazonReviewsTrust({ apiKey, model, reviewsText }) {
  const instructions = [
    "You are an advanced AI system trained to detect fake, manipulated, or low-quality reviews.",
    "",
    "Analyze the following Amazon product reviews.",
    "",
    "Your task:",
    "1. Detect signs of fake or manipulated reviews",
    "2. Identify patterns like:",
    "   - Repetitive wording",
    "   - Overly generic praise",
    "   - Lack of specific product details",
    "   - Suspiciously extreme sentiment",
    "   - Review similarity across multiple entries",
    "3. Evaluate overall trustworthiness",
    "",
    "Return STRICT JSON:",
    "",
    "{",
    '  "trustScore": number (0-100),',
    '  "verdict": "Highly Trustworthy" | "Mixed Signals" | "Suspicious",',
    '  "summary": "2-3 line explanation",',
    '  "issues": ["issue1", "issue2"]',
    "}",
    "",
    "Reviews:",
    reviewsText,
  ].join("\n");

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Return strict JSON only. No markdown fences." },
        { role: "user", content: instructions },
      ],
      temperature: 0.25,
      max_tokens: 900,
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
  return JSON.parse(content.slice(firstBrace, lastBrace + 1));
}

function normalizeAmazonVerdict(v) {
  const s = String(v || "").trim();
  if (s === "Highly Trustworthy") return "Highly Trustworthy";
  if (s === "Mixed Signals") return "Mixed Signals";
  if (s === "Suspicious") return "Suspicious";
  const t = s.toLowerCase();
  if (t.includes("highly") && t.includes("trust")) return "Highly Trustworthy";
  if (t.includes("mixed")) return "Mixed Signals";
  if (t.includes("suspicious")) return "Suspicious";
  return "Mixed Signals";
}

async function analyzeAmazonReviewsTrust({ apiKey, model, reviewsText }) {
  const preview = String(reviewsText || "").length;
  if (!apiKey) return mockAmazonReviewsTrust(preview);
  try {
    const res = await openAiAmazonReviewsTrust({ apiKey, model, reviewsText });
    let trustScore = Math.round(Number(res.trustScore));
    if (!Number.isFinite(trustScore)) trustScore = 50;
    trustScore = Math.max(0, Math.min(100, trustScore));
    const verdict = normalizeAmazonVerdict(res.verdict);
    const summary = String(res.summary || "").trim() || "No summary provided.";
    const issues = Array.isArray(res.issues) ? res.issues.map((x) => String(x)) : [];
    return { trustScore, verdict, summary, issues };
  } catch {
    return mockAmazonReviewsTrust(preview);
  }
}

function mockAmazonInlineScores(items) {
  return {
    scores: items.map((it, i) => {
      const n = String(it.text || "").length + String(it.id || "").length + i;
      const credibilityScore = 32 + (n % 56);
      return { id: String(it.id), credibilityScore };
    }),
  };
}

async function openAiAmazonReviewInlineScores({ apiKey, model, items }) {
  const blocks = items.map((it) => {
    const author = String(it.author || "Unknown").slice(0, 160);
    const body = String(it.text || "").slice(0, 6500);
    return `ID: ${it.id}\nAuthor: ${author}\nReview:\n${body}`;
  });

  const user = [
    "You assess individual Amazon product reviews (one score per review).",
    "For each review, estimate how credible the REVIEW TEXT appears: specificity, balanced tone, detail about the product, vs generic hype, manipulation cues, or empty praise.",
    "",
    "Return STRICT JSON with this shape only:",
    '{ "scores": [ { "id": string, "credibilityScore": number } ] }',
    "credibilityScore is an integer 0-100 (higher = more credible as a review). Include every ID exactly once.",
    "",
    "---",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");

  const resp = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Return strict JSON only. No markdown." },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 2500,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 90000,
    }
  );

  const content = resp.data?.choices?.[0]?.message?.content ?? "";
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("OpenAI returned non-JSON content");
  }
  return JSON.parse(content.slice(firstBrace, lastBrace + 1));
}

async function scoreAmazonReviewsIndividually({ apiKey, model, items }) {
  if (!items || items.length === 0) return { scores: [] };
  if (!apiKey) return mockAmazonInlineScores(items);
  try {
    const res = await openAiAmazonReviewInlineScores({ apiKey, model, items });
    const raw = Array.isArray(res.scores) ? res.scores : [];
    const byId = new Map();
    for (const row of raw) {
      const id = String(row.id || "");
      let s = Math.round(Number(row.credibilityScore));
      if (!Number.isFinite(s)) s = 50;
      s = Math.max(0, Math.min(100, s));
      if (id) byId.set(id, s);
    }
    const scores = items.map((it) => ({
      id: String(it.id),
      credibilityScore: byId.has(String(it.id)) ? byId.get(String(it.id)) : 45,
    }));
    return { scores };
  } catch {
    return mockAmazonInlineScores(items);
  }
}

module.exports = {
  analyzeText,
  checkAiVision,
  analyzeAmazonReviewsTrust,
  scoreAmazonReviewsIndividually,
};
