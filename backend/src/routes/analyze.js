const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const Post = require("../models/Post");
const { analyzeText } = require("../lib/openai");
const { calculateFinalScore, calculateBotScore, clamp } = require("../lib/scoring");
const { getEnv, resolveOpenAiApiKey } = require("../lib/env");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");

const router = express.Router();

router.post("/", async (req, res) => {
  const schema = z.object({
    text: z.string().min(1).max(5000),
    username: z.string().optional().default(""),
    userId: z.string().optional().default(""),
    source: z.string().optional().default("extension"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { text, username, userId, source } = parsed.data;
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

  const analysis = await analyzeText({
    apiKey: resolveOpenAiApiKey(env),
    model: env.OPENAI_MODEL,
    text,
  });

  const aiScore = clamp(Number(analysis.aiScore ?? 50), 0, 100);
  const aiGeneratedProbability = clamp(
    Number(analysis.aiGeneratedProbability ?? 0.5),
    0,
    1
  );
  const explanation = String(analysis.explanation || "No explanation available.");

  const finalScore = calculateFinalScore(aiScore, baseTrust, botScore);

  const post = isDbReady()
    ? await Post.create({
        content: text,
        aiScore,
        aiGeneratedProbability,
        finalScore,
        explanation,
        userId: user ? user._id : undefined,
        username: user ? user.username : username,
        source,
      })
    : memoryStore.addPost({
        content: text,
        aiScore,
        aiGeneratedProbability,
        finalScore,
        explanation,
        userId: user ? user._id : undefined,
        username: user ? user.username : username,
        source,
      });

  return res.json({
    aiScore,
    aiGeneratedProbability,
    explanation,
    trustScore: baseTrust,
    botScore,
    finalScore,
    postId: post._id,
  });
});

module.exports = router;

