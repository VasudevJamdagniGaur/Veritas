const express = require("express");
const User = require("../models/User");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");
const { clamp } = require("../lib/scoring");

const router = express.Router();

const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "stories",
  "accounts",
  "legal",
  "about",
  "developer",
  "direct",
  "tv",
]);

function normalizeHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

/** How “real” the account looks (0–100): blends trust vs bot risk. */
function realnessFromUser(user) {
  const trust = Number(user.trustScore ?? 50);
  const bot = Number(user.botScore ?? 50);
  const verifiedBonus = user.isHumanVerified ? 5 : 0;
  const base = trust * 0.5 + (100 - bot) * 0.5;
  return clamp(Math.round(base + verifiedBonus), 0, 100);
}

function mockRealness(handle) {
  let h = 0;
  const s = String(handle);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 101;
}

/**
 * GET /api/instagram/trust/:handle
 * Returns { realnessScore, handle, source: "user" | "mock" }
 */
router.get("/trust/:handle", async (req, res) => {
  const handle = normalizeHandle(req.params.handle);
  if (!handle || RESERVED.has(handle)) {
    return res.status(400).json({ error: "Invalid handle" });
  }

  if (isDbReady()) {
    const user =
      (await User.findOne({ username: handle })) ||
      (await User.findOne({
        socialHandle: { $in: [handle, `@${handle}`] },
      })) ||
      (await User.findOne({
        socialUrl: new RegExp(`instagram\\.com\\/${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
      }));
    if (user) {
      return res.json({
        realnessScore: realnessFromUser(user),
        handle,
        source: "user",
        trustScore: user.trustScore,
        botScore: user.botScore,
        isHumanVerified: user.isHumanVerified,
      });
    }
  } else {
    const byName =
      memoryStore.findUserByInstagramHandle(handle) || memoryStore.findUserByUsername(handle);
    if (byName) {
      return res.json({
        realnessScore: realnessFromUser(byName),
        handle,
        source: "user",
        trustScore: byName.trustScore,
        botScore: byName.botScore,
        isHumanVerified: byName.isHumanVerified,
        db: "memory",
      });
    }
  }

  return res.json({
    realnessScore: mockRealness(handle),
    handle,
    source: "mock",
  });
});

module.exports = router;
