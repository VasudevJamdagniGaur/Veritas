const express = require("express");
const { z } = require("zod");
const { analyzeAmazonReviewsTrust } = require("../lib/openai");
const { getEnv, resolveOpenAiApiKey } = require("../lib/env");

const router = express.Router();

router.post("/", async (req, res) => {
  const schema = z.object({
    reviewsText: z.string().min(40).max(120_000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const env = getEnv();
  const apiKey = resolveOpenAiApiKey(env);
  const model = env.OPENAI_MODEL;

  const result = await analyzeAmazonReviewsTrust({
    apiKey,
    model,
    reviewsText: parsed.data.reviewsText,
  });

  return res.json(result);
});

module.exports = router;
