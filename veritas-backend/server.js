/**
 * Veritas hybrid backend entry (Node.js).
 * Exposes HTTP; can delegate scoring to Python via subprocess.
 */
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5051;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "veritas-backend-node", port: PORT });
});

/**
 * POST /predict
 * Body (one of):
 *   - XGBoost: { followers, following, posts_per_day, account_age }
 *   - Legacy heuristic: { text: "..." }
 */
app.post("/predict", (req, res) => {
  const b = req.body || {};
  const hasFeatures =
    b.followers != null &&
    b.following != null &&
    b.posts_per_day != null &&
    b.account_age != null;
  const text = String(b.text || "");
  if (!hasFeatures && !text) {
    return res.status(400).json({
      error: "Send followers/following/posts_per_day/account_age or text",
    });
  }

  const py = process.env.PYTHON || "python";
  const script = path.join(__dirname, "model.py");
  const child = spawn(py, [script, "predict"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  let out = "";
  let err = "";
  child.stdout.on("data", (d) => {
    out += d.toString();
  });
  child.stderr.on("data", (d) => {
    err += d.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({
        error: "Python model failed",
        detail: err.slice(-500) || String(code),
      });
    }
    try {
      const line = out.trim().split("\n").filter(Boolean).pop();
      const json = JSON.parse(line);
      return res.json(json);
    } catch {
      return res.status(500).json({ error: "Invalid model output", raw: out.slice(-500) });
    }
  });

  const stdinPayload = hasFeatures
    ? {
        followers: Number(b.followers),
        following: Number(b.following),
        posts_per_day: Number(b.posts_per_day),
        account_age: Number(b.account_age),
      }
    : { text };

  child.stdin.write(JSON.stringify(stdinPayload) + "\n");
  child.stdin.end();
});

app.listen(PORT, () => {
  console.log(`veritas-backend (Node) listening on http://localhost:${PORT}`);
});
