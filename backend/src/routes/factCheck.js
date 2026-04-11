const express = require("express");
const { z } = require("zod");
const { getEnv } = require("../lib/env");
const { runFactCheck } = require("../lib/factCheckService");

const router = express.Router();

router.post("/", async (req, res) => {
  const schema = z.object({
    text: z.string().min(80).max(120_000),
    url: z.string().max(4000).optional(),
    title: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const env = getEnv();
  const result = await runFactCheck({
    env,
    text: parsed.data.text,
    url: parsed.data.url,
    title: parsed.data.title,
  });

  return res.json(result);
});

module.exports = router;
