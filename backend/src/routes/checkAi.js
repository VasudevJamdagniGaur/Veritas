const express = require("express");
const { z } = require("zod");
const { checkAiVision } = require("../lib/openai");
const { getEnv, resolveOpenAiApiKey } = require("../lib/env");

const router = express.Router();

function stripBase64Payload(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return m ? m[1] : s;
}

router.post("/", async (req, res) => {
  const schema = z.object({
    imageBase64: z.string().min(80).max(11_000_000),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const imageBase64 = stripBase64Payload(parsed.data.imageBase64);
  if (imageBase64.length < 80) {
    return res.status(400).json({ error: "imageBase64 too short after parsing" });
  }

  const env = getEnv();
  const apiKey = resolveOpenAiApiKey(env);
  const model = env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const result = await checkAiVision({
    apiKey,
    model,
    imageBase64,
  });

  return res.json(result);
});

module.exports = router;
