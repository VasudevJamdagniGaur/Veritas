/**
 * Proxies social account scoring to localhost (avoids mixed-content blocks
 * from https sites → http://localhost in the content script).
 * Instagram uses a raw handle (trust API + XGBoost). Other sites use prefixed keys (e.g. x:handle) for XGBoost only.
 *
 * Match URLs with extension/config.js when you change ports.
 */
const VERITAS_API_BASE = "http://localhost:5000/api";
const VERITAS_DETECT_URL = "http://127.0.0.1:8000/detect";

function hashHandle(handle) {
  let h = 0;
  const s = String(handle);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic pseudo-metrics so XGBoost runs per handle until real scraping exists. */
function featuresFromHandle(handle) {
  const h = hashHandle(handle);
  const followers = 80 + (h % 480_000);
  const following = 12 + ((h >> 3) % 12_000);
  const posts_per_day = Math.round((50 + ((h >> 7) % 180)) / 20) / 10;
  const account_age = 45 + ((h >> 11) % 3_500);
  return {
    followers,
    following,
    posts_per_day,
    account_age,
  };
}

function localMockRealness(handle) {
  return hashHandle(handle) % 101;
}

/**
 * @returns {Promise<{ score: number, source: string, bot_probability?: number }>}
 */
async function scoreSocialHandle(handle) {
  const h = String(handle);
  const enc = encodeURIComponent(h);
  const tryTrust = !h.includes(":");

  if (tryTrust) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const trustR = await fetch(`${VERITAS_API_BASE}/instagram/trust/${enc}`, {
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (trustR.ok) {
        const t = await trustR.json();
        if (t.source === "user") {
          return {
            score: Math.max(0, Math.min(100, Math.round(Number(t.realnessScore) || 0))),
            source: "veritas-user",
            bot_probability:
              typeof t.botScore === "number" ? Math.min(1, Math.max(0, Number(t.botScore) / 100)) : undefined,
          };
        }
      }
    } catch {
      // continue to ML path
    }
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const body = featuresFromHandle(h);
    const r = await fetch(VERITAS_DETECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (r.ok) {
      const j = await r.json();
      const auth = Number(j.authenticity);
      const bot = Number(j.bot_probability);
      return {
        score: Math.max(0, Math.min(100, Math.round(Number.isFinite(auth) ? auth : (1 - bot) * 100))),
        source: "xgboost",
        bot_probability: Number.isFinite(bot) ? bot : undefined,
      };
    }
  } catch {
    // offline fallback
  }

  return {
    score: localMockRealness(h),
    source: "offline",
  };
}

chrome.runtime.onInstalled.addListener(() => {});

/**
 * POST /api/analyze from the service worker so https sites (Instagram, X, …)
 * can reach http://localhost without mixed-content blocking the content script.
 */
function analyzeTextViaApi(text, username, userId, source) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 25000);
  return fetch(`${VERITAS_API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: String(text),
      username: username != null ? String(username) : "",
      userId: userId != null ? String(userId) : "",
      source: source != null ? String(source) : "extension",
    }),
    signal: ctrl.signal,
  })
    .then(async (resp) => {
      clearTimeout(tid);
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Analyze failed: ${resp.status}${errBody ? ` ${errBody.slice(0, 200)}` : ""}`);
      }
      return resp.json();
    })
    .catch((e) => {
      clearTimeout(tid);
      throw e;
    });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Shrink huge tab screenshots before POST (OpenAI payload / memory). */
async function downscaleDataUrlIfLarge(dataUrl, maxWidth = 960) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (blob.size < 400000) return dataUrl;
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxWidth / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    const ab = await outBlob.arrayBuffer();
    return `data:image/jpeg;base64,${arrayBufferToBase64(ab)}`;
  } catch {
    return dataUrl;
  }
}

function analyzeReelVisualViaApi(payload) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 120000);
  // Must match backend: POST /api/analyze-visual (same as http://localhost:5000/api/analyze-visual when VERITAS_API_BASE is http://localhost:5000/api)
  return fetch(`${VERITAS_API_BASE}/analyze-visual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: ctrl.signal,
  })
    .then(async (resp) => {
      clearTimeout(tid);
      const txt = await resp.text();
      let json;
      try {
        json = JSON.parse(txt);
      } catch {
        throw new Error(`Analyze-visual failed: ${resp.status} ${txt.slice(0, 180)}`);
      }
      if (!resp.ok) {
        const detail = json.detail || json.error || txt;
        const hint = json.hint ? `\n${json.hint}` : "";
        const msg =
          typeof detail === "string" ? `${detail}${hint}` : `${JSON.stringify(json)}${hint}`;
        throw new Error(msg);
      }
      return json;
    })
    .catch((e) => {
      clearTimeout(tid);
      throw e;
    });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const t = msg?.type;

  if (t === "VERITAS_ANALYZE_REEL") {
    const windowId = _sender.tab?.windowId;
    (async () => {
      try {
        let images = Array.isArray(msg.images)
          ? msg.images.filter((u) => typeof u === "string" && u.startsWith("data:image"))
          : [];
        if (images.length === 0) {
          const shot = await chrome.tabs.captureVisibleTab(
            windowId == null ? undefined : windowId,
            { format: "jpeg", quality: 72 }
          );
          if (!shot) throw new Error("Could not capture the tab (keep the reel visible and try again).");
          images = [shot];
        }
        images = images.slice(0, 3);
        images = await Promise.all(images.map((u) => downscaleDataUrlIfLarge(u)));

        const text = typeof msg.text === "string" ? msg.text.slice(0, 4500) : "";
        const data = await analyzeReelVisualViaApi({
          text,
          images,
          username: msg.username != null ? String(msg.username) : "",
          userId: msg.userId != null ? String(msg.userId) : "",
          source: msg.source != null ? String(msg.source) : "extension",
        });
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (t === "VERITAS_ANALYZE" && typeof msg.text === "string" && msg.text.length > 0) {
    analyzeTextViaApi(msg.text, msg.username, msg.userId, msg.source)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if ((t === "VERITAS_SOCIAL_SCORE" || t === "VERITAS_INSTAGRAM_SCORE") && msg.handle) {
    const handle = String(msg.handle).replace(/^@/, "");
    scoreSocialHandle(handle)
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  return false;
});
