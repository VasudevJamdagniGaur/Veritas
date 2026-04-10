const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const { calculateBotScore, clamp } = require("../lib/scoring");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");

const router = express.Router();

function base64UrlDecodeToJson(part) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

router.post("/login", async (req, res) => {
  const schema = z.object({
    username: z.string().min(2).max(32),
    walletAddress: z.string().optional().default(""),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { username, walletAddress } = parsed.data;

  if (!isDbReady() && memoryStore) {
    try {
      const user = memoryStore.getOrCreateUser({ username });
      if (walletAddress && !user.walletAddress) user.walletAddress = walletAddress;
      user.botScore = clamp(calculateBotScore(user), 0, 100);
      memoryStore.updateUser(user);
      return res.json({ user, db: "memory" });
    } catch (e) {
      return res.status(400).json({ error: "Invalid username" });
    }
  }

  let user = await User.findOne({ username });
  if (!user) {
    user = await User.create({
      username,
      walletAddress,
      trustScore: 50,
      botScore: 70, // new accounts start more suspicious for demo impact
      isHumanVerified: false,
    });
  } else if (walletAddress && !user.walletAddress) {
    user.walletAddress = walletAddress;
  }

  user.botScore = clamp(calculateBotScore(user), 0, 100);
  await user.save();

  return res.json({ user });
});

// MVP Google sign up:
// - If frontend sends a real Google `idToken`, we decode it (no signature verification in MVP).
// - If no token, frontend may send an email (mock fallback).
router.post("/google", async (req, res) => {
  const schema = z.object({
    idToken: z.string().optional().default(""),
    email: z.string().email().optional().default(""),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { idToken, email } = parsed.data;

  let derivedUsername = "";
  if (idToken) {
    try {
      const parts = idToken.split(".");
      if (parts.length >= 2) {
        const payload = base64UrlDecodeToJson(parts[1]);
        const mail = String(payload.email || "").toLowerCase();
        const sub = String(payload.sub || "");
        derivedUsername = mail ? mail.split("@")[0] : sub ? `google_${sub.slice(0, 10)}` : "";
      }
    } catch {
      // fall through
    }
  }

  if (!derivedUsername && email) derivedUsername = email.split("@")[0];
  if (!derivedUsername) {
    return res.status(400).json({ error: "Google sign up unavailable (missing token/email)" });
  }

  // Constrain to our existing username rules
  derivedUsername = derivedUsername.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
  if (derivedUsername.length < 2) derivedUsername = `google_user_${Date.now().toString().slice(-6)}`;

  if (!isDbReady()) {
    const user = memoryStore.getOrCreateUser({ username: derivedUsername });
    user.botScore = clamp(calculateBotScore(user), 0, 100);
    memoryStore.updateUser(user);
    return res.json({ user, provider: "google", username: derivedUsername, db: "memory" });
  }

  let user = await User.findOne({ username: derivedUsername });
  if (!user) {
    user = await User.create({
      username: derivedUsername,
      trustScore: 55,
      botScore: 55,
      isHumanVerified: false,
    });
  }

  user.botScore = clamp(calculateBotScore(user), 0, 100);
  await user.save();

  return res.json({ user, provider: "google", username: derivedUsername });
});

module.exports = router;

