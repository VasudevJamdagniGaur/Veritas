const crypto = require("crypto");

/** Uppercase, lowercase, digits, and safe symbols — 24 characters total. */
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+.";

function randomIndex(max) {
  if (typeof crypto.randomInt === "function") {
    return crypto.randomInt(0, max);
  }
  return crypto.randomBytes(4).readUInt32BE(0) % max;
}

function generateWalletId() {
  let s = "";
  for (let i = 0; i < 24; i++) {
    s += CHARSET[randomIndex(CHARSET.length)];
  }
  return s;
}

/**
 * Assigns a Veritas Wallet ID if missing. Mutates `user`.
 * @returns {boolean} true if a new id was assigned
 */
function ensureWalletId(user) {
  if (!user) return false;
  const w = user.walletId != null ? String(user.walletId) : "";
  if (w.length === 24) return false;
  user.walletId = generateWalletId();
  return true;
}

module.exports = { generateWalletId, ensureWalletId };
