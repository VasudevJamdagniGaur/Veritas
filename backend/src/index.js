require("dotenv").config();

const { bootstrapGoogleApplicationCredentials } = require("./lib/googleCredentials");

bootstrapGoogleApplicationCredentials();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { getEnv } = require("./lib/env");
const { resolveVertexProjectId } = require("./lib/vertexProject");
const { connectDb, isDbReady } = require("./lib/db");
const apiRoutes = require("./routes");
const analyzeVisualRoutes = require("./routes/analyzeVisual");

async function main() {
  const env = getEnv();
  const vertexProjectId = resolveVertexProjectId(env);
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath) {
    // eslint-disable-next-line no-console
    console.log(`[Veritas] Service account JSON (ADC): ${credPath}`);
    // eslint-disable-next-line no-console
    console.log(
      vertexProjectId
        ? `[Veritas] Vertex AI: project "${vertexProjectId}"`
        : "[Veritas] Vertex AI: credentials file found but project id missing — set VERTEX_PROJECT or ensure JSON includes `project_id`"
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[Veritas] No service account file resolved. Set GOOGLE_APPLICATION_CREDENTIALS or VERTEX_SERVICE_ACCOUNT_KEY to the JSON path (see backend/.env.example). Reel visuals will fall back to mock unless GEMINI_API_KEY or OPENAI_API_KEY is set."
    );
  }
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
  app.get("/api/health", (_req, res) => {
    const geminiKey = env.GEMINI_API_KEY && String(env.GEMINI_API_KEY).trim();
    const openaiKey = env.OPENAI_API_KEY && String(env.OPENAI_API_KEY).trim();
    const willMock =
      !vertexProjectId && !geminiKey && !openaiKey;
    res.json({
      ok: true,
      dbReady: isDbReady(),
      reelVision: {
        willUseMock: willMock,
        vertexProjectId: vertexProjectId || null,
        hasGoogleApplicationCredentials: Boolean(credPath),
      },
    });
  });

  // Mount reel vision on the app (before app.use("/api", …)) so POST /api/analyze-visual is never shadowed by /api/analyze.
  app.get("/api/analyze-visual", (_req, res) =>
    res.json({
      ok: true,
      hint: "POST JSON body: { text?: string, images: string[] } (data URLs). Extension: POST http://localhost:5000/api/analyze-visual",
    })
  );
  app.use("/api/analyze-visual", analyzeVisualRoutes);

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
    console.log(`  Reel vision: POST http://localhost:${env.PORT}/api/analyze-visual`);
    // eslint-disable-next-line no-console
    if (env.PORT === 5000) console.log("Backend running on port 5000");
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

