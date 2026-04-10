const { readProjectIdFromCredentialFiles } = require("./googleCredentials");

/**
 * Resolve GCP project id for Vertex AI:
 * 1) VERTEX_PROJECT (from env)
 * 2) GOOGLE_CLOUD_PROJECT
 * 3) project_id inside any service account JSON (see googleCredentials CREDENTIALS_ENV_KEYS)
 */
function resolveVertexProjectId(env) {
  const fromVertex = env.VERTEX_PROJECT && String(env.VERTEX_PROJECT).trim();
  if (fromVertex) return fromVertex;

  const fromGcp = process.env.GOOGLE_CLOUD_PROJECT && String(process.env.GOOGLE_CLOUD_PROJECT).trim();
  if (fromGcp) return fromGcp;

  return readProjectIdFromCredentialFiles();
}

module.exports = { resolveVertexProjectId };
