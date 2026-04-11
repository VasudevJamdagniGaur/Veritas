const express = require("express");

const authRoutes = require("./auth");
const userRoutes = require("./user");
const analyzeRoutes = require("./analyze");
const checkAiRoutes = require("./checkAi");
const postsRoutes = require("./posts");
const instagramRoutes = require("./instagram");

const router = express.Router();

router.get("/health", (_req, res) => res.json({ ok: true, service: "veritas-backend" }));

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/analyze", analyzeRoutes);
router.use("/check-ai", checkAiRoutes);
router.use("/posts", postsRoutes);
router.use("/instagram", instagramRoutes);

module.exports = router;

