const express = require("express");
const { z } = require("zod");
const User = require("../models/User");
const Post = require("../models/Post");
const { calculateBotScore, clamp } = require("../lib/scoring");
const { maybeWriteVerification } = require("../lib/chain");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");
const { ensureWalletId } = require("../lib/walletId");

function persistWalletIdMemory(user) {
  if (ensureWalletId(user)) memoryStore.updateUser(user);
}

async function persistWalletIdMongo(user) {
  if (ensureWalletId(user)) await user.save();
}

const router = express.Router();

router.post("/verify-face", async (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    captureDataUrl: z.string().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { userId, captureDataUrl } = parsed.data;
  if (!isDbReady()) {
    const user = memoryStore.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    persistWalletIdMemory(user);
    user.isHumanVerified = true;
    user.faceCaptureDataUrl = captureDataUrl;
    user.trustScore = clamp((user.trustScore ?? 50) + 15, 0, 100);
    user.botScore = clamp(calculateBotScore(user), 0, 100);
    memoryStore.updateUser(user);
    return res.json({ user, chain: { wrote: false, reason: "memory-mode" }, db: "memory" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  await persistWalletIdMongo(user);

  user.isHumanVerified = true;
  user.faceCaptureDataUrl = captureDataUrl;
  user.trustScore = clamp(user.trustScore + 15, 0, 100);
  user.botScore = clamp(calculateBotScore(user), 0, 100);
  await user.save();

  const chain = await maybeWriteVerification({
    walletAddress: user.walletAddress,
    isVerified: user.isHumanVerified,
    trustScore: user.trustScore,
  });

  return res.json({ user, chain });
});

function normalizeHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^u\//i, "");
}

router.post("/link-social", async (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    socialHandle: z.string().optional().default(""),
    socialUrl: z.string().optional().default(""),
    linkedinUrl: z.string().optional().default(""),
    redditUsername: z.string().optional().default(""),
    instagramHandle: z.string().optional().default(""),
    xHandle: z.string().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { userId, socialHandle, socialUrl, linkedinUrl, redditUsername, instagramHandle, xHandle } = parsed.data;

  const li = linkedinUrl.trim();
  const rd = normalizeHandle(redditUsername);
  const ig = normalizeHandle(instagramHandle);
  const xh = normalizeHandle(xHandle);
  const sh = socialHandle.trim();
  const su = socialUrl.trim();

  const hasNewLink = Boolean(li || rd || ig || xh || sh || su);

  const applyLinks = (user) => {
    if (li) user.linkedinUrl = li;
    if (rd) user.redditUsername = rd;
    if (ig) user.instagramHandle = ig.toLowerCase();
    if (xh) {
      user.xHandle = xh;
      if (!user.socialHandle) {
        user.socialHandle = `@${xh}`;
        user.socialUrl = `https://x.com/${xh}`;
      }
    }
    if (sh) user.socialHandle = sh;
    if (su) user.socialUrl = su;
    if (hasNewLink) {
      user.trustScore = clamp((user.trustScore ?? 50) + 5, 0, 100);
    }
    user.botScore = clamp(calculateBotScore(user), 0, 100);
  };

  if (!isDbReady()) {
    const user = memoryStore.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    persistWalletIdMemory(user);
    applyLinks(user);
    memoryStore.updateUser(user);
    return res.json({ user, db: "memory" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  await persistWalletIdMongo(user);

  applyLinks(user);
  await user.save();

  return res.json({ user });
});

router.post("/set-username", async (req, res) => {
  const schema = z.object({
    userId: z.string().min(1),
    username: z.string().min(2).max(32),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const { userId, username } = parsed.data;
  const clean = username.replace(/[^a-zA-Z0-9_]/g, "_");

  if (!isDbReady()) {
    const out = memoryStore.setUsername({ userId, username: clean });
    if (out.error) {
      const code = out.error === "Username already taken" ? 409 : out.error === "User not found" ? 404 : 400;
      return res.status(code).json({ error: out.error, db: "memory" });
    }
    persistWalletIdMemory(out.user);
    return res.json({ user: out.user, db: "memory" });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const existing = await User.findOne({ username: clean });
  if (existing && String(existing._id) !== String(user._id)) {
    return res.status(409).json({ error: "Username already taken" });
  }

  user.username = clean;
  await user.save();
  await persistWalletIdMongo(user);
  return res.json({ user });
});

router.delete("/:id", async (req, res) => {
  const userId = req.params.id;
  if (!userId || String(userId).length < 2) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  if (!isDbReady()) {
    const result = memoryStore.deleteUser(userId);
    if (result.error) return res.status(404).json({ error: result.error });
    return res.json({ ok: true, db: "memory" });
  }

  const deleted = await User.findByIdAndDelete(userId);
  if (!deleted) return res.status(404).json({ error: "User not found" });
  await Post.deleteMany({ userId: deleted._id });
  return res.json({ ok: true });
});

router.get("/:id", async (req, res) => {
  if (!isDbReady()) {
    const user = memoryStore.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    persistWalletIdMemory(user);
    return res.json({ user, db: "memory" });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  await persistWalletIdMongo(user);
  return res.json({ user });
});

module.exports = router;

