const fs = require("fs");
const path = require("path");

const OPENAI_KEYS = new Set(["OPENAI_API_KEY"]);

function stripBom(s) {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

/**
 * Read `.env` as UTF-8 or UTF-16 (Windows Notepad "Unicode" saves UTF-16 LE + BOM).
 * Plain `utf8` + dotenv fail silently for UTF-16, leaving OPENAI_API_KEY unset.
 */
function readEnvFileText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (!buf.length) return "";
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString("utf16le");
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.slice(2));
    body.swap16();
    return body.toString("utf16le");
  }
  let s = buf.toString("utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

/**
 * If dotenv skipped a value (encoding, tooling), set OpenAI keys from raw file lines.
 */
function manualInjectOpenAiKeys(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw;
  try {
    raw = readEnvFileText(filePath);
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

  /** Length of value after = on OPENAI_API_KEY line (0 = missing on disk — unsaved editor is a common cause). */
  function openaiValueLenOnDisk(filePath) {
    if (!fs.existsSync(filePath)) return -1;
    try {
      const raw = readEnvFileText(filePath);
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.*)$/);
        if (m) return m[1].replace(/\r$/, "").trim().length;
      }
    } catch {
      return -1;
    }
    return -1;
  }

  const valLenDisk = openaiValueLenOnDisk(backendEnv);
  if (valLenDisk === 0 && fs.existsSync(backendEnv)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Veritas] backend/.env has OPENAI_API_KEY= but the value is empty on disk. Save the file in your editor (Ctrl+S), then restart the server."
    );
  }
}

module.exports = { loadEnvFiles };
