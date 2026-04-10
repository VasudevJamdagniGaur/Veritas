const express = require("express");

const authRoutes = require("./auth");
const userRoutes = require("./user");
const analyzeRoutes = require("./analyze");
const analyzeVisualRoutes = require("./analyzeVisual");
const postsRoutes = require("./posts");
const instagramRoutes = require("./instagram");

const router = express.Router();

router.get("/health", (_req, res) => res.json({ ok: true, service: "veritas-backend" }));

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
// Must be BEFORE "/analyze" — otherwise Express treats "/analyze-visual" as under "/analyze" (prefix match).
router.use("/analyze-visual", analyzeVisualRoutes);
router.use("/analyze", analyzeRoutes);
router.use("/posts", postsRoutes);
router.use("/instagram", instagramRoutes);

module.exports = router;

