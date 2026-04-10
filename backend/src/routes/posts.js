const express = require("express");
const Post = require("../models/Post");
const { isDbReady } = require("../lib/db");
const { memoryStore } = require("../lib/memoryStore");

const router = express.Router();

router.get("/", async (_req, res) => {
  if (!isDbReady()) {
    return res.json({ posts: memoryStore.listPosts(), db: "memory" });
  }
  const posts = await Post.find().sort({ createdAt: -1 }).limit(100);
  return res.json({ posts });
});

module.exports = router;

