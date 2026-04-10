const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const Post = require("../models/Post");
const { analyzeVisual: analyzeVisualOpenAI, mockAnalyzeVisual } = require("../lib/openai");
const { analyzeVisualVertex } = require("../lib/vertexVisual");
const { resolveVertexProjectId } = require("../lib/vertexProject");
const { analyzeVisualGeminiApi } = require("../lib/geminiApiVisual");
const { calculateFinalScore, calculateBotScore, clamp } = require("../lib/scoring");
const { getEnv } = require("../lib/env");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");

const router = express.Router();

/**
 * Try backends in order until one succeeds:
 * 1) GEMINI_API_KEY — Google AI Studio (simplest; no Vertex ADC)
 * 2) Vertex (VERTEX_PROJECT / GOOGLE_CLOUD_PROJECT + ADC)
 * 3) OpenAI (optional)
 * 4) Mock if nothing configured
 */
async function runVisualBackends(env, text, images) {
  const errors = [];
  const geminiKey = env.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim();
  if (geminiKey) {
    try {
      const a = await analyzeVisualGeminiApi({
        apiKey: geminiKey,
        model: env.GEMINI_MODEL,
        text,
        images,
      });
      return { analysis: a, provider: "gemini" };
    } catch (e) {
      errors.push(`Gemini API: ${String(e?.message || e)}`);
    }
  }

  const vertexProject = resolveVertexProjectId(env);

  if (vertexProject) {
    try {
      const a = await analyzeVisualVertex({
        project: vertexProject,
        location: env.VERTEX_LOCATION,
        model: env.VERTEX_MODEL,
        text,
        images,
      });
      return { analysis: a, provider: "vertex" };
    } catch (e) {
      errors.push(`Vertex: ${String(e?.message || e)}`);
    }
  }

  if (env.OPENAI_API_KEY && String(env.OPENAI_API_KEY).trim()) {
    try {
      const a = await analyzeVisualOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        text,
        images,
      });
      return { analysis: a, provider: "openai" };
    } catch (e) {
      errors.push(`OpenAI: ${String(e?.response?.data?.error?.message || e?.message || e)}`);
    }
  }

  if (!geminiKey && !vertexProject && !(env.OPENAI_API_KEY && String(env.OPENAI_API_KEY).trim())) {
    return {
      analysis: mockAnalyzeVisual(text, images.length),
      provider: "mock",
    };
  }

  const detail = errors.join(" | ");
  const err = new Error(detail || "All vision backends failed");
  err.statusCode = 502;
  err.hint =
    "Easiest fix: add GEMINI_API_KEY from https://aistudio.google.com/apikey to backend/.env and restart. " +
    "For Vertex: set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path (project_id is read automatically), " +
    "or set VERTEX_PROJECT, enable Vertex AI API + billing, and grant the SA Vertex AI User. " +
    "Or set OPENAI_API_KEY.";
  throw err;
}

router.post("/", async (req, res) => {
  const schema = z.object({
    text: z.string().max(4500).optional().default(""),
    images: z
      .array(z.string().min(50).max(7_000_000))
      .min(1)
      .max(4),
    username: z.string().optional().default(""),
    userId: z.string().optional().default(""),
    source: z.string().optional().default("extension"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { text, images, username, userId, source } = parsed.data;
  const env = getEnv();

  let user = null;
  if (isDbReady()) {
    if (userId) user = await User.findById(userId);
    if (!user && username) user = await User.findOne({ username });
  } else {
    if (userId) user = memoryStore.findUserById(userId);
    if (!user && username) user = memoryStore.findUserByUsername(username);
  }

  const baseTrust = user ? user.trustScore : 45;
  const botScore = user ? clamp(calculateBotScore(user), 0, 100) : 65;

  let analysis;
  let analysisProvider = "unknown";
  try {
    const out = await runVisualBackends(env, text, images);
    analysis = out.analysis;
    analysisProvider = out.provider;
  } catch (e) {
    const msg = String(e?.message || e);
    return res.status(e?.statusCode || 502).json({
      error: "Vision analysis failed",
      detail: msg,
      hint: e?.hint || "See backend logs.",
    });
  }

  const aiScore = clamp(Number(analysis.aiScore ?? 50), 0, 100);
  const aiGeneratedProbability = clamp(
    Number(analysis.aiGeneratedProbability ?? 0.5),
    0,
    1
  );
  const explanation = String(analysis.explanation || "No explanation available.");

  const finalScore = calculateFinalScore(aiScore, baseTrust, botScore);

  const storedContent = `[visual:${images.length} frames] ${text ? text.slice(0, 500) : ""}`.trim();

  const post = isDbReady()
    ? await Post.create({
        content: storedContent || "reel-visual",
        aiScore,
        aiGeneratedProbability,
        finalScore,
        explanation,
        userId: user ? user._id : undefined,
        username: user ? user.username : username,
        source: `${source}-visual`,
      })
    : memoryStore.addPost({
        content: storedContent || "reel-visual",
        aiScore,
        aiGeneratedProbability,
        finalScore,
        explanation,
        userId: user ? user._id : undefined,
        username: user ? user.username : username,
        source: `${source}-visual`,
      });

  return res.json({
    aiScore,
    aiGeneratedProbability,
    explanation,
    trustScore: baseTrust,
    botScore,
    finalScore,
    postId: post._id,
    analysisSource: "visual",
    visualProvider: analysisProvider,
  });
});

module.exports = router;
