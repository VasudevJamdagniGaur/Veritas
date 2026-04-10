const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const Post = require("../models/Post");
const { analyzeVisual } = require("../lib/openai");
const { calculateFinalScore, calculateBotScore, clamp } = require("../lib/scoring");
const { getEnv } = require("../lib/env");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");

const router = express.Router();

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
  try {
    analysis = await analyzeVisual({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      text,
      images,
    });
  } catch (e) {
    const msg = String(e?.response?.data?.error?.message || e?.message || e);
    return res.status(502).json({
      error: "Vision analysis failed",
      detail: msg,
      hint: "Use a vision-capable model in OPENAI_MODEL (e.g. gpt-4o-mini or gpt-4o).",
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
  });
});

module.exports = router;
