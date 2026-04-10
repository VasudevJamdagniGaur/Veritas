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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const t = msg?.type;
  if ((t !== "VERITAS_SOCIAL_SCORE" && t !== "VERITAS_INSTAGRAM_SCORE") || !msg.handle) {
    return false;
  }

  const handle = String(msg.handle).replace(/^@/, "");
  scoreSocialHandle(handle)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));

  return true;
});
