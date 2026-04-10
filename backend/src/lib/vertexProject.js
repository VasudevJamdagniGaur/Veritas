const fs = require("fs");
const path = require("path");

/**
 * Resolve GCP project id for Vertex AI:
 * 1) VERTEX_PROJECT (from env)
 * 2) GOOGLE_CLOUD_PROJECT
 * 3) project_id inside the JSON file at GOOGLE_APPLICATION_CREDENTIALS (service account key)
 */
function resolveVertexProjectId(env) {
  const fromVertex = env.VERTEX_PROJECT && String(env.VERTEX_PROJECT).trim();
  if (fromVertex) return fromVertex;

  const fromGcp = process.env.GOOGLE_CLOUD_PROJECT && String(process.env.GOOGLE_CLOUD_PROJECT).trim();
  if (fromGcp) return fromGcp;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS && String(process.env.GOOGLE_APPLICATION_CREDENTIALS).trim();
  if (!credPath) return "";

  try {
    const abs = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
    if (!fs.existsSync(abs)) return "";
    const raw = fs.readFileSync(abs, "utf8");
    const j = JSON.parse(raw);
    const pid = j.project_id && String(j.project_id).trim();
    return pid || "";
  } catch {
    return "";
  }
}

module.exports = { resolveVertexProjectId };
