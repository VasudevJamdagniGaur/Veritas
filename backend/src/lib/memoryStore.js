const crypto = require("crypto");

const state = {
  usersById: new Map(),
  usersByUsername: new Map(),
  posts: [],
};

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return crypto.randomUUID();
}

function sanitizeUsername(username) {
  const clean = String(username || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 32);
  return clean;
}

function getOrCreateUser({ username }) {
  const u = sanitizeUsername(username);
  if (!u || u.length < 2) throw new Error("Invalid username");

  const existing = state.usersByUsername.get(u);
  if (existing) return existing;

  const user = {
    _id: makeId(),
    username: u,
    walletAddress: "",
    trustScore: 50,
    botScore: 70,
    isHumanVerified: false,
    socialHandle: "",
    socialUrl: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.usersById.set(user._id, user);
  state.usersByUsername.set(user.username, user);
  return user;
}

function updateUser(user) {
  user.updatedAt = nowIso();
  state.usersById.set(user._id, user);
  state.usersByUsername.set(user.username, user);
  return user;
}

function findUserById(id) {
  return state.usersById.get(id) || null;
}

function findUserByUsername(username) {
  const u = sanitizeUsername(username);
  return state.usersByUsername.get(u) || null;
}

function normalizeIgHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

/** Match Instagram-style handle (dots allowed) against Veritas username or socialHandle. */
function findUserByInstagramHandle(handle) {
  const h = normalizeIgHandle(handle);
  if (!h) return null;
  for (const user of state.usersById.values()) {
    if (String(user.username || "").toLowerCase() === h) return user;
    const sh = normalizeIgHandle(user.socialHandle || "");
    if (sh && sh === h) return user;
    const url = String(user.socialUrl || "").toLowerCase();
    if (url.includes(`instagram.com/${h}`) || url.includes(`instagram.com/${h}/`)) return user;
  }
  return null;
}

function setUsername({ userId, username }) {
  const user = findUserById(userId);
  if (!user) return { error: "User not found" };

  const clean = sanitizeUsername(username);
  if (!clean || clean.length < 2) return { error: "Invalid username" };

  const existing = state.usersByUsername.get(clean);
  if (existing && existing._id !== user._id) return { error: "Username already taken" };

  // remove old mapping
  state.usersByUsername.delete(user.username);
  user.username = clean;
  updateUser(user);
  return { user };
}

function addPost(post) {
  const p = {
    _id: makeId(),
    createdAt: nowIso(),
    ...post,
  };
  state.posts.unshift(p);
  state.posts = state.posts.slice(0, 200);
  return p;
}

function listPosts() {
  return state.posts.slice(0, 100);
}

module.exports = {
  memoryStore: {
    getOrCreateUser,
    findUserById,
    findUserByUsername,
    findUserByInstagramHandle,
    updateUser,
    setUsername,
    addPost,
    listPosts,
  },
  sanitizeUsername,
};

