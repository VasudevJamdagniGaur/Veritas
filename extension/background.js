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
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

/**
 * Resize large images before POST to keep payloads under Express limits and reduce cost.
 * @param {Blob} blob
 * @param {number} maxSide
 * @returns {Promise<string>} raw base64 (JPEG)
 */
async function blobToDownscaledJpegBase64(blob, maxSide = 1280) {
  const bmp = await createImageBitmap(blob);
  const w = bmp.width;
  const h = bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w, h, 1));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = new OffscreenCanvas(tw, th);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0, tw, th);
  const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
  const ab = await outBlob.arrayBuffer();
  return arrayBufferToBase64(ab);
}

/**
 * POST /api/check-ai (vision) from the service worker for https pages.
 * @param {{ imageBase64?: string, imageUrl?: string }} payload
 */
function checkAiViaApi(payload) {
  const run = async () => {
    let base64 = "";
    if (payload.imageBase64) {
      const raw = String(payload.imageBase64).trim();
      const m = raw.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      base64 = m ? m[1] : raw;
    } else if (payload.imageUrl) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(String(payload.imageUrl), {
        mode: "cors",
        credentials: "omit",
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
      const blob = await r.blob();
      base64 = await blobToDownscaledJpegBase64(blob);
    } else {
      throw new Error("Missing imageBase64 or imageUrl");
    }

    if (!base64 || base64.length < 32) throw new Error("Empty image data");

    const ctrl2 = new AbortController();
    const tid2 = setTimeout(() => ctrl2.abort(), 90000);
    const resp = await fetch(`${VERITAS_API_BASE}/check-ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
      signal: ctrl2.signal,
    });
    clearTimeout(tid2);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`Check AI failed: ${resp.status}${errBody ? ` ${errBody.slice(0, 240)}` : ""}`);
    }
    return resp.json();
  };

  return run();
}

function amazonInlineScoresViaApi(reviews) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 90000);
  return fetch(`${VERITAS_API_BASE}/amazon-review-scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviews }),
    signal: ctrl.signal,
  })
    .then(async (resp) => {
      clearTimeout(tid);
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Amazon review scores failed: ${resp.status}${errBody ? ` ${errBody.slice(0, 220)}` : ""}`);
      }
      return resp.json();
    })
    .catch((e) => {
      clearTimeout(tid);
      throw e;
    });
}

function factCheckViaApi(payload) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 120000);
  return fetch(`${VERITAS_API_BASE}/fact-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: String(payload.text),
      url: payload.url != null ? String(payload.url) : undefined,
      title: payload.title != null ? String(payload.title) : undefined,
    }),
    signal: ctrl.signal,
  })
    .then(async (resp) => {
      clearTimeout(tid);
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Fact check failed: ${resp.status}${errBody ? ` ${errBody.slice(0, 240)}` : ""}`);
      }
      return resp.json();
    })
    .catch((e) => {
      clearTimeout(tid);
      throw e;
    });
}

function amazonReviewTrustViaApi(reviewsText) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 90000);
  return fetch(`${VERITAS_API_BASE}/amazon-review-trust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewsText: String(reviewsText) }),
    signal: ctrl.signal,
  })
    .then(async (resp) => {
      clearTimeout(tid);
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Amazon review trust failed: ${resp.status}${errBody ? ` ${errBody.slice(0, 220)}` : ""}`);
      }
      return resp.json();
    })
    .catch((e) => {
      clearTimeout(tid);
      throw e;
    });
}

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const t = msg?.type;

  if (t === "VERITAS_ANALYZE" && typeof msg.text === "string" && msg.text.length > 0) {
    analyzeTextViaApi(msg.text, msg.username, msg.userId, msg.source)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (t === "VERITAS_CHECK_AI" && (msg.imageBase64 || msg.imageUrl)) {
    checkAiViaApi({
      imageBase64: msg.imageBase64,
      imageUrl: msg.imageUrl,
    })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (t === "VERITAS_AMAZON_REVIEW_TRUST" && typeof msg.reviewsText === "string" && msg.reviewsText.length >= 40) {
    amazonReviewTrustViaApi(msg.reviewsText)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (t === "VERITAS_AMAZON_INLINE_SCORES" && Array.isArray(msg.reviews) && msg.reviews.length > 0) {
    amazonInlineScoresViaApi(msg.reviews)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (t === "VERITAS_FACT_CHECK" && typeof msg.text === "string" && msg.text.length >= 40) {
    factCheckViaApi({ text: msg.text, url: msg.url, title: msg.title })
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
