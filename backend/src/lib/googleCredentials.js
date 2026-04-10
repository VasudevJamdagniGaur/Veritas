const fs = require("fs");
const path = require("path");

/**
 * Env vars that can point at a service account JSON file. First existing file wins.
 * Users often use the wrong name; we normalize to GOOGLE_APPLICATION_CREDENTIALS for ADC.
 */
const CREDENTIALS_ENV_KEYS = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "VERTEX_SERVICE_ACCOUNT_KEY",
  "GCP_SERVICE_ACCOUNT_KEY",
  "GOOGLE_CREDENTIALS_FILE",
];

function stripQuotes(s) {
  let t = String(s).trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1);
  }
  return t.trim();
}

/**
 * @returns {string | null} absolute path to an existing file
 */
function resolveExistingJsonPath(raw) {
  if (raw == null || !String(raw).trim()) return null;
  const trimmed = stripQuotes(raw);
  if (!trimmed) return null;
  const abs = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);
  try {
    if (!fs.existsSync(abs)) return null;
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    return abs;
  } catch {
    return null;
  }
}

/**
 * Ensures process.env.GOOGLE_APPLICATION_CREDENTIALS is set to an absolute path
 * so @google-cloud/* libraries authenticate. Call once after dotenv.config().
 * @returns {{ ok: boolean, path?: string, via?: string }}
 */
function bootstrapGoogleApplicationCredentials() {
  const tried = [];
  for (const key of CREDENTIALS_ENV_KEYS) {
    const raw = process.env[key];
    if (raw == null || !String(raw).trim()) continue;
    const abs = resolveExistingJsonPath(raw);
    if (abs) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = abs;
      return { ok: true, path: abs, via: key };
    }
    tried.push({ key, raw: stripQuotes(String(raw)) });
  }

  for (const { key, raw } of tried) {
    const resolved = path.isAbsolute(raw)
      ? path.normalize(raw)
      : path.resolve(process.cwd(), raw);
    // eslint-disable-next-line no-console
    console.error(
      `[Veritas] ${key} does not point to an existing file (resolved: ${resolved}, cwd: ${process.cwd()})`
    );
  }

  return { ok: false };
}

/**
 * project_id from the first readable service account JSON found via CREDENTIALS_ENV_KEYS.
 */
function readProjectIdFromCredentialFiles() {
  for (const key of CREDENTIALS_ENV_KEYS) {
    const raw = process.env[key];
    const abs = resolveExistingJsonPath(raw);
    if (!abs) continue;
    try {
      const rawJson = fs.readFileSync(abs, "utf8");
      const j = JSON.parse(rawJson);
      const pid = j.project_id && String(j.project_id).trim();
      if (pid) return pid;
    } catch {
      // try next key
    }
  }
  return "";
}

module.exports = {
  bootstrapGoogleApplicationCredentials,
  resolveExistingJsonPath,
  readProjectIdFromCredentialFiles,
  CREDENTIALS_ENV_KEYS,
};
