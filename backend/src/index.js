require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { getEnv } = require("./lib/env");
const { connectDb, isDbReady } = require("./lib/db");
const apiRoutes = require("./routes");
const analyzeVisualRoutes = require("./routes/analyzeVisual");

async function main() {
  const env = getEnv();
  connectDb(env.MONGODB_URI).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn("MongoDB not available. Running in in-memory fallback mode.");
    // eslint-disable-next-line no-console
    console.warn(e?.message || e);
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "12mb" }));
  app.use(morgan("dev"));

  app.get("/", (_req, res) => res.json({ ok: true, name: "Veritas API" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, dbReady: isDbReady() })
  );

  // Mount reel vision here (not only under ./routes) so no nested-router / prefix bugs can hide POST /api/visual-analyze.
  app.get("/api/visual-analyze", (_req, res) =>
    res.json({
      ok: true,
      hint: "POST JSON body: { text?: string, images: string[] } (data URLs). Extension uses this path.",
    })
  );
  app.use("/api/visual-analyze", analyzeVisualRoutes);

  app.use("/api", apiRoutes);

  app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Veritas backend listening on http://localhost:${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`  Reel vision: POST http://localhost:${env.PORT}/api/visual-analyze`);
    // eslint-disable-next-line no-console
    if (env.PORT === 5000) console.log("Backend running on port 5000");
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

