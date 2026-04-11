const express = require("express");
const { z } = require("zod");
const { scoreAmazonReviewsIndividually } = require("../lib/openai");
const { getEnv, resolveOpenAiApiKey } = require("../lib/env");

const router = express.Router();

const ItemSchema = z.object({
  id: z.string().min(4).max(120),
  author: z.string().max(200).optional(),
  text: z.string().min(12).max(8000),
});

router.post("/", async (req, res) => {
  const schema = z.object({
    reviews: z.array(ItemSchema).min(1).max(28),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const env = getEnv();
  const apiKey = resolveOpenAiApiKey(env);
  const model = env.OPENAI_MODEL;

  const result = await scoreAmazonReviewsIndividually({
    apiKey,
    model,
    items: parsed.data.reviews,
  });

  return res.json(result);
});

module.exports = router;
