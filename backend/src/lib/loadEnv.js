const fs = require("fs");
const path = require("path");

const OPENAI_KEYS = new Set(["REACT_APP_OPENAI_API_KEY", "OPENAI_API_KEY"]);

function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

/**
 * If dotenv skipped a value (encoding, tooling), set OpenAI keys from raw file lines.
 */
function manualInjectOpenAiKeys(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  raw = stripBom(raw);
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t
      .slice(0, eq)
      .trim()
      .replace(/^\uFEFF/, "");
    if (!OPENAI_KEYS.has(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    val = val.trim();
    if (!val) continue;
    const cur = process.env[key];
    if (cur == null || !String(cur).trim()) {
      process.env[key] = val;
    }
  }
}

/**
 * Load env from repo root then backend (backend wins). `backendDir` = directory containing backend `index.js`.
 */
function loadEnvFiles(backendDir) {
  const rootEnv = path.join(backendDir, "..", ".env");
  const backendEnv = path.join(backendDir, ".env");

  if (fs.existsSync(rootEnv)) {
    require("dotenv").config({ path: rootEnv, override: false });
  }
  if (fs.existsSync(backendEnv)) {
    require("dotenv").config({ path: backendEnv, override: true });
  }

  manualInjectOpenAiKeys(rootEnv);
  manualInjectOpenAiKeys(backendEnv);
}

module.exports = { loadEnvFiles };
