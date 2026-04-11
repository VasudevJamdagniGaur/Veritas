(() => {
  const API_BASE =
    (typeof window !== "undefined" && window.VERITAS_API_BASE) ||
    "http://localhost:5000/api";

  const STYLE_ID = "veritas-style";
  const TAG_ATTR = "data-veritas-processed";
  const IG_TAG = "data-veritas-ig-badge";
  const SOCIAL_TAG = "data-veritas-account-badge";

  let reelVideoIdSeq = 0;

  const host =
    typeof location !== "undefined" ? location.hostname.replace(/^www\./, "") : "";

  const isInstagram =
    typeof location !== "undefined" &&
    (location.hostname === "www.instagram.com" || location.hostname === "instagram.com");
  const isX = host === "x.com" || host === "twitter.com";
  const isLinkedIn = host === "linkedin.com";
  const isReddit = host === "reddit.com" || host === "old.reddit.com" || host === "new.reddit.com";

  /**
   * Extension messaging API (Chrome `chrome`, Firefox `browser`). Do not require `runtime.id` —
   * it is often missing inside iframes / embedded contexts even though `sendMessage` works.
   */
  function extensionRuntime() {
    try {
      const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null;
      if (!g) return null;
      const rt = g.chrome?.runtime || g.browser?.runtime;
      if (rt && typeof rt.sendMessage === "function") return rt;
    } catch {
      /* ignore */
    }
    return null;
  }

  function getLastRuntimeError() {
    try {
      return globalThis.chrome?.runtime?.lastError || globalThis.browser?.runtime?.lastError;
    } catch {
      return undefined;
    }
  }

  /** After extension reload/update, old content scripts cannot talk to the new background — user must refresh the tab. */
  function formatExtensionMessagingError(raw) {
    const m = String(raw?.message != null ? raw.message : raw || "");
    if (/context invalidated/i.test(m)) {
      return "This tab is still on an old Veritas session (extension was reloaded or updated). Refresh the page (F5).";
    }
    if (/receiving end does not exist|could not establish connection/i.test(m)) {
      return "Veritas background is not reachable. Refresh the page (F5), or reload the extension on chrome://extensions and then refresh this tab.";
    }
    return m;
  }

  /**
   * Single path for background `sendMessage` (text analyze + social score).
   * @returns {Promise<object|null>} response object, or `null` if no extension runtime (caller may fall back to fetch).
   */
  function sendMessageToExtension(message) {
    const rt = extensionRuntime();
    if (!rt) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      try {
        rt.sendMessage(message, (response) => {
          const err = getLastRuntimeError();
          if (err) {
            reject(new Error(formatExtensionMessagingError(err)));
            return;
          }
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  const IG_RESERVED = new Set([
    "p",
    "reel",
    "reels",
    "explore",
    "stories",
    "accounts",
    "legal",
    "about",
    "developer",
    "direct",
    "tv",
  ]);

  function injectStyleOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .veritas-card {
        margin-top: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(18,18,18,0.92);
        border-radius: 14px;
        padding: 10px 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color: #E5E7EB;
      }
      .veritas-row { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .veritas-badge {
        display:inline-flex; align-items:center; gap:8px;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid rgba(233,30,99,0.35);
        background: rgba(233,30,99,0.12);
        color: #FBCFE8;
      }
      .veritas-pill {
        display:inline-flex;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: #D1D5DB;
      }
      .veritas-score { font-weight: 700; }
      .veritas-insight {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.35;
        color: #D1D5DB;
      }
      .veritas-insight b { color: #FBCFE8; }
      .veritas-warn { color: #FCA5A5; }
      .veritas-ok { color: #86EFAC; }

      /* Check AI (vision) toolbar + result */
      .veritas-post-toolbar {
        margin-top: 8px;
        clear: both;
      }
      .veritas-check-ai-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .veritas-check-ai-btn {
        appearance: none;
        border: 1px solid rgba(233, 30, 99, 0.45);
        background: linear-gradient(180deg, rgba(233, 30, 99, 0.25), rgba(233, 30, 99, 0.12));
        color: #fce7f3;
        font-size: 12px;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 999px;
        cursor: pointer;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      }
      .veritas-check-ai-btn:hover:not(:disabled) {
        background: rgba(233, 30, 99, 0.35);
      }
      .veritas-check-ai-btn:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .veritas-check-ai-panel {
        margin-top: 8px;
      }
      .veritas-check-ai-card {
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(12, 12, 14, 0.95);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.4;
        color: #e5e7eb;
        max-width: 100%;
        box-sizing: border-box;
      }
      .veritas-check-ai-card--loading {
        color: #d1d5db;
        font-style: italic;
      }
      .veritas-check-ai-card--err {
        color: #fecaca;
        border-color: rgba(248, 113, 113, 0.45);
      }
      .veritas-check-ai-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .veritas-check-ai-title {
        font-weight: 800;
        letter-spacing: 0.02em;
        color: #fbcfe8;
        font-size: 11px;
        text-transform: uppercase;
      }
      .veritas-check-ai-verdict {
        font-weight: 800;
        font-size: 13px;
        padding: 2px 10px;
        border-radius: 999px;
      }
      .veritas-check-ai-verdict--real {
        background: rgba(34, 197, 94, 0.2);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, 0.45);
      }
      .veritas-check-ai-verdict--ai {
        background: rgba(244, 63, 94, 0.18);
        color: #fecdd3;
        border: 1px solid rgba(244, 63, 94, 0.5);
      }
      .veritas-check-ai-meter {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 11px;
        color: #9ca3af;
        margin-bottom: 4px;
      }
      .veritas-check-ai-meter strong {
        color: #f9fafb;
        font-size: 18px;
      }
      .veritas-check-ai-bar {
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
        margin-bottom: 8px;
      }
      .veritas-check-ai-bar > span {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #f472b6, #e11d48);
      }
      .veritas-check-ai-expl {
        margin: 0;
        color: #d1d5db;
        font-size: 12px;
      }

      /* Instagram full-screen Reel: pin Check AI to top-right of the video frame */
      .veritas-ig-reel-overlay {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2147483645;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        max-width: min(340px, calc(100% - 20px));
        pointer-events: auto;
      }
      .veritas-ig-reel-overlay .veritas-check-ai-panel {
        margin-top: 0;
        width: 100%;
      }
      .veritas-ig-reel-overlay .veritas-check-ai-btn {
        box-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(6px);
      }

      /* Account authenticity pill (Instagram, X, LinkedIn, Reddit, …) */
      .veritas-ig-realness {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        margin-left: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        vertical-align: middle;
        border: 1px solid rgba(255,255,255,0.2);
        background: rgba(0,0,0,0.45);
        color: #fff;
        box-shadow: 0 2px 10px rgba(0,0,0,0.25);
      }
      .veritas-ig-realness--high {
        border-color: rgba(34,197,94,0.55);
        background: rgba(34,197,94,0.2);
        color: #bbf7d0;
      }
      .veritas-ig-realness--mid {
        border-color: rgba(250,204,21,0.55);
        background: rgba(250,204,21,0.15);
        color: #fef08a;
      }
      .veritas-ig-realness--low {
        border-color: rgba(244,63,94,0.55);
        background: rgba(244,63,94,0.18);
        color: #fecdd3;
      }
      .veritas-ig-realness--loading {
        opacity: 0.75;
        font-weight: 600;
      }
      /* Stay on the same line as the username (Reels often stacks block siblings above Follow). */
      .veritas-ig-realness--next-to-handle {
        flex-shrink: 0;
        margin-left: 8px;
        margin-right: 4px;
        vertical-align: middle;
      }

      /* LinkedIn default UI is light gray/white — translucent pills are illegible. */
      .veritas-account-badge--linkedin.veritas-ig-realness {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.06);
      }
      .veritas-account-badge--linkedin.veritas-ig-realness--loading {
        background: #e5e7eb !important;
        border: 1px solid #6b7280 !important;
        color: #1f2937 !important;
        opacity: 1;
      }
      .veritas-account-badge--linkedin.veritas-ig-realness--high {
        background: #bbf7d0 !important;
        border: 1px solid #15803d !important;
        color: #14532d !important;
      }
      .veritas-account-badge--linkedin.veritas-ig-realness--mid {
        background: #fef08a !important;
        border: 1px solid #a16207 !important;
        color: #713f12 !important;
      }
      .veritas-account-badge--linkedin.veritas-ig-realness--low {
        background: #fecaca !important;
        border: 1px solid #b91c1c !important;
        color: #7f1d1d !important;
      }

      /* X / Twitter: compact + solid contrast (translucent defaults are invisible on dark UI). */
      .veritas-account-badge--x.veritas-ig-realness {
        box-sizing: border-box !important;
        position: relative !important;
        z-index: 2147483646 !important;
        display: inline-flex !important;
        flex-shrink: 0 !important;
        min-width: 1.35rem !important;
        max-width: none !important;
        min-height: 16px !important;
        padding: 1px 6px !important;
        margin-left: 4px !important;
        margin-right: 2px !important;
        font-size: 11px !important;
        line-height: 1.25 !important;
        font-weight: 700 !important;
        border-radius: 999px !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45) !important;
      }
      .veritas-account-badge--x.veritas-ig-realness--loading {
        background: #52525b !important;
        border: 1px solid #d4d4d8 !important;
        color: #fafafa !important;
        opacity: 1 !important;
      }
      .veritas-account-badge--x.veritas-ig-realness--high {
        background: #15803d !important;
        border: 1px solid #4ade80 !important;
        color: #ffffff !important;
      }
      .veritas-account-badge--x.veritas-ig-realness--mid {
        background: #a16207 !important;
        border: 1px solid #facc15 !important;
        color: #fefce8 !important;
      }
      .veritas-account-badge--x.veritas-ig-realness--low {
        background: #b91c1c !important;
        border: 1px solid #fca5a5 !important;
        color: #ffffff !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function tone(score) {
    if (score >= 70) return "ok";
    if (score >= 45) return "mid";
    return "bad";
  }

  function instagramHandleFromHref(href) {
    if (!href || href === "#" || href.startsWith("javascript:")) return null;
    try {
      const base = "https://www.instagram.com";
      const u = href.startsWith("http") ? new URL(href) : new URL(href, base);
      const host = u.hostname.replace(/^www\./, "");
      if (!host.endsWith("instagram.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      const first = parts[0];
      if (IG_RESERVED.has(first.toLowerCase())) return null;
      if (!/^[a-zA-Z0-9._]+$/.test(first)) return null;
      return first;
    } catch {
      return null;
    }
  }

  const X_RESERVED = new Set([
    "home",
    "explore",
    "notifications",
    "messages",
    "settings",
    "search",
    "compose",
    "login",
    "signup",
    "i",
    "intent",
    "account",
    "privacy",
    "help",
    "tos",
    "following",
    "followers",
    "verified_followers",
    "hashtag",
    "lists",
    "communities",
    "topics",
    "share",
    "oauth",
    "download",
    "who_to_follow",
    "connect_redir",
    "hashtag_click",
    "search-advanced",
    "your_tweet_analytics",
  ]);

  const LI_RESERVED = new Set([
    "feed",
    "jobs",
    "company",
    "school",
    "pulse",
    "notifications",
    "messaging",
    "learning",
    "sales",
    "groups",
    "events",
  ]);

  const REDDIT_USER_BAD = new Set([
    "message",
    "compose",
    "submit",
    "about",
    "login",
    "logout",
    "me",
    "null",
  ]);

  function xHandleFromHref(href) {
    if (!href || href === "#" || href.startsWith("javascript:")) return null;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, "https://x.com");
      const h = u.hostname.replace(/^www\./, "");
      if (h !== "x.com" && h !== "twitter.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 1) return null;
      const seg = parts[0];
      if (X_RESERVED.has(seg.toLowerCase())) return null;
      if (!/^[a-zA-Z0-9_]{1,30}$/.test(seg)) return null;
      return `x:${seg}`;
    } catch {
      return null;
    }
  }

  /** X renders ⋮ menus in #layers / role=menu — those <a> are not the tweet header; skip or badge lands inside the dropdown. */
  function isXEphemeralOverlayUI(a) {
    const layers = document.getElementById("layers");
    if (layers && layers.contains(a)) return true;
    if (a.closest('[role="menu"]')) return true;
    if (a.closest('[role="listbox"]')) return true;
    return false;
  }

  /**
   * Tweet row: only badge links under [data-testid="User-Name"] (next to @handle).
   * Elsewhere in the tweet (body, cards, ⋮ menu portal): no badge. Nav/sidebar: allow.
   */
  function shouldAttachXAccountBadge(a) {
    if (isXEphemeralOverlayUI(a)) return false;
    const tweet = a.closest('[data-testid="tweet"]');
    if (tweet) {
      return !!(a.closest('[data-testid="User-Name"]') || a.closest('[data-testid="UserName"]'));
    }
    return true;
  }

  /** X sometimes nests links inside open shadow roots — normal querySelector misses them. */
  function collectAnchorsDeep(root, selector, acc, seen) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(selector).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        acc.push(el);
      }
    });
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) collectAnchorsDeep(el.shadowRoot, selector, acc, seen);
    });
  }

  function linkedinVanityFromHref(href) {
    if (!href || href === "#" || href.startsWith("javascript:")) return null;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, "https://www.linkedin.com");
      const h = u.hostname.replace(/^www\./, "");
      if (!h.endsWith("linkedin.com")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] !== "in" || !parts[1]) return null;
      const v = parts[1];
      if (LI_RESERVED.has(v.toLowerCase())) return null;
      if (!/^[a-zA-Z0-9\-_%]{2,120}$/.test(v)) return null;
      return `li:${decodeURIComponent(v)}`;
    } catch {
      return null;
    }
  }

  function redditUserFromHref(href) {
    if (!href || href === "#" || href.startsWith("javascript:")) return null;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, "https://www.reddit.com");
      const h = u.hostname.replace(/^www\./, "");
      if (h !== "reddit.com" && h !== "old.reddit.com" && h !== "new.reddit.com") return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      const kind = parts[0].toLowerCase();
      if (kind !== "user" && kind !== "u") return null;
      const name = parts[1];
      if (!name || REDDIT_USER_BAD.has(name.toLowerCase())) return null;
      if (!/^[a-zA-Z0-9_-]{2,40}$/.test(name)) return null;
      return `reddit:${decodeURIComponent(name)}`;
    } catch {
      return null;
    }
  }

  const accountScoreCache = new Map();

  /** Same algorithm as backend `mockRealness` — used when API is blocked (HTTPS → HTTP localhost). */
  function localMockRealness(handle) {
    let h = 0;
    const s = String(handle);
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 101;
  }

  /**
   * Instagram runs on https:// — direct fetch to http://localhost is blocked (mixed content).
   * Prefer the service worker (background.js): trust API for registered users, else FastAPI /detect (XGBoost).
   * On plain http pages (e.g. mock feed), direct fetch still works as a fallback.
   */
  async function fetchAccountScore(scoreKey) {
    if (accountScoreCache.has(scoreKey)) return accountScoreCache.get(scoreKey);
    const p = (async () => {
      try {
        const bg = await sendMessageToExtension({ type: "VERITAS_SOCIAL_SCORE", handle: scoreKey });
        if (bg && bg.ok === true && typeof bg.score === "number") {
          return {
            realnessScore: bg.score,
            source: bg.source || "extension-bg",
            bot_probability: typeof bg.bot_probability === "number" ? bg.bot_probability : undefined,
          };
        }
      } catch {
        // fall through to direct fetch / mock
      }

      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const resp = await fetch(`${API_BASE}/instagram/trust/${encodeURIComponent(scoreKey)}`, {
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!resp.ok) throw new Error(String(resp.status));
        const data = await resp.json();
        return {
          realnessScore: Number(data.realnessScore),
          source: data.source || "api",
          bot_probability: typeof data.botScore === "number" ? Number(data.botScore) : undefined,
        };
      } catch {
        return {
          realnessScore: localMockRealness(scoreKey),
          source: "local",
        };
      }
    })();
    accountScoreCache.set(scoreKey, p);
    return p;
  }

  function isInstagramReelSurface() {
    const p = (location.pathname || "").toLowerCase();
    return p.includes("/reel/") || p.startsWith("/reels");
  }

  /** Profile avatar links are usually image-only; badge should attach to the text username link. */
  function isLikelyInstagramAvatarLink(a) {
    if (!a || !a.querySelector("img")) return false;
    const text = (a.textContent || "").replace(/\s+/g, "").trim();
    if (text.length > 0) return false;
    const r = a.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    if (Math.abs(r.width - r.height) > 8) return false;
    if (r.width > 80) return false;
    return true;
  }

  const isLikelyGenericAvatarLink = isLikelyInstagramAvatarLink;

  function applyAccountBadgeTitles(badge, score, src, botPct) {
    if (src === "xgboost") {
      badge.title =
        botPct != null
          ? `Veritas · XGBoost: authenticity ${score}/100 · bot ~${botPct}% · start: cd veritas-backend && uvicorn model:app --reload`
          : `Veritas · XGBoost: authenticity ${score}/100`;
    } else if (src === "veritas-user") {
      badge.title = `Veritas · Registered user: authenticity ${score}/100${botPct != null ? ` · botScore ~${botPct}%` : ""}`;
    } else if (src === "offline" || src === "local") {
      badge.title = `Veritas: ${score}/100 (offline estimate — run backend :5000 + FastAPI :8000 for live scores)`;
    } else {
      badge.title = `Veritas authenticity: ${score}/100 (${src})`;
    }
  }

  function attachAccountScoreBadge(anchor, scoreKey, useReelWrap, extraBadgeClass) {
    const badge = document.createElement("span");
    badge.className = "veritas-ig-realness veritas-ig-realness--loading";
    if (extraBadgeClass) badge.classList.add(extraBadgeClass);
    badge.textContent = "…";
    badge.title = "Veritas: account authenticity (0–100, higher = more human)";

    if (useReelWrap && anchor.parentNode) {
      const wrap = document.createElement("span");
      wrap.setAttribute("data-veritas-handle-wrap", "1");
      wrap.style.cssText =
        "display:inline-flex;align-items:center;flex-wrap:nowrap;gap:6px;vertical-align:middle;max-width:100%;";
      anchor.parentNode.insertBefore(wrap, anchor);
      wrap.appendChild(anchor);
      wrap.appendChild(badge);
      badge.classList.add("veritas-ig-realness--next-to-handle");
    } else {
      anchor.insertAdjacentElement("afterend", badge);
    }

    fetchAccountScore(scoreKey)
      .then((data) => {
        const score = clamp(Math.round(Number(data.realnessScore) || 0), 0, 100);
        const botPct =
          typeof data.bot_probability === "number"
            ? clamp(Math.round(data.bot_probability * 100), 0, 100)
            : null;
        badge.textContent = String(score);
        badge.classList.remove("veritas-ig-realness--loading");
        applyRealnessClass(badge, score);
        applyAccountBadgeTitles(badge, score, data.source || "api", botPct);
      })
      .catch(() => {
        const score = localMockRealness(scoreKey);
        badge.textContent = String(score);
        badge.classList.remove("veritas-ig-realness--loading");
        applyRealnessClass(badge, score);
        badge.title = `Veritas: ${score}/100 (fallback)`;
      });
  }

  function applyRealnessClass(el, score) {
    el.classList.remove(
      "veritas-ig-realness--high",
      "veritas-ig-realness--mid",
      "veritas-ig-realness--low"
    );
    const t = tone(score);
    if (t === "ok") el.classList.add("veritas-ig-realness--high");
    else if (t === "mid") el.classList.add("veritas-ig-realness--mid");
    else el.classList.add("veritas-ig-realness--low");
  }

  function scanInstagram() {
    injectStyleOnce();
    const anchors = Array.from(document.querySelectorAll('a[href^="/"], a[href*="instagram.com"]'));
    const slotSeen = new Set();
    for (const a of anchors) {
      if (a.getAttribute(IG_TAG) === "1") continue;
      const handle = instagramHandleFromHref(a.getAttribute("href") || "");
      if (!handle) continue;
      if (isLikelyInstagramAvatarLink(a)) continue;

      const r = a.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;

      const slot = `${handle}@${Math.round(r.top / 320)}_${Math.round(r.left / 200)}`;
      if (slotSeen.has(slot)) {
        a.setAttribute(IG_TAG, "1");
        continue;
      }
      slotSeen.add(slot);

      a.setAttribute(IG_TAG, "1");
      attachAccountScoreBadge(a, handle, isInstagramReelSurface());
    }
  }

  function scanXAccountBadges() {
    injectStyleOnce();
    const sel = 'a[href^="/"], a[href*="x.com/"], a[href*="twitter.com/"]';
    const seen = new Set();
    const collected = [];
    collectAnchorsDeep(document, sel, collected, seen);
    const anchors = collected;
    const slotSeen = new Set();
    for (const a of anchors) {
      if (a.getAttribute(SOCIAL_TAG) === "1") continue;
      const scoreKey = xHandleFromHref(a.getAttribute("href") || "");
      if (!scoreKey) continue;
      if (isLikelyGenericAvatarLink(a)) continue;
      if (!shouldAttachXAccountBadge(a)) continue;
      const userNameRow = a.closest('[data-testid="User-Name"]') || a.closest('[data-testid="UserName"]');
      if (userNameRow && userNameRow.getAttribute("data-veritas-x-userline") === "1") {
        a.setAttribute(SOCIAL_TAG, "1");
        continue;
      }
      const r = a.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      const slot = `${scoreKey}@${Math.round(r.top / 320)}_${Math.round(r.left / 200)}`;
      if (slotSeen.has(slot)) {
        a.setAttribute(SOCIAL_TAG, "1");
        continue;
      }
      slotSeen.add(slot);
      a.setAttribute(SOCIAL_TAG, "1");
      if (userNameRow) userNameRow.setAttribute("data-veritas-x-userline", "1");
      attachAccountScoreBadge(a, scoreKey, false, "veritas-account-badge--x");
    }
  }

  function scanLinkedInAccountBadges() {
    injectStyleOnce();
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/in/"], a[href*="linkedin.com/in/"]')
    );
    const slotSeen = new Set();
    for (const a of anchors) {
      if (a.getAttribute(SOCIAL_TAG) === "1") continue;
      const scoreKey = linkedinVanityFromHref(a.getAttribute("href") || "");
      if (!scoreKey) continue;
      if (isLikelyGenericAvatarLink(a)) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      const slot = `${scoreKey}@${Math.round(r.top / 280)}_${Math.round(r.left / 200)}`;
      if (slotSeen.has(slot)) {
        a.setAttribute(SOCIAL_TAG, "1");
        continue;
      }
      slotSeen.add(slot);
      a.setAttribute(SOCIAL_TAG, "1");
      attachAccountScoreBadge(a, scoreKey, false, "veritas-account-badge--linkedin");
    }
  }

  function scanRedditAccountBadges() {
    injectStyleOnce();
    const anchors = Array.from(
      document.querySelectorAll(
        'a[href*="/user/"], a[href*="/u/"], a[href*="reddit.com/user/"], a[href*="reddit.com/u/"]'
      )
    );
    const slotSeen = new Set();
    for (const a of anchors) {
      if (a.getAttribute(SOCIAL_TAG) === "1") continue;
      const scoreKey = redditUserFromHref(a.getAttribute("href") || "");
      if (!scoreKey) continue;
      if (isLikelyGenericAvatarLink(a)) continue;
      const r = a.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      const slot = `${scoreKey}@${Math.round(r.top / 280)}_${Math.round(r.left / 200)}`;
      if (slotSeen.has(slot)) {
        a.setAttribute(SOCIAL_TAG, "1");
        continue;
      }
      slotSeen.add(slot);
      a.setAttribute(SOCIAL_TAG, "1");
      attachAccountScoreBadge(a, scoreKey, false);
    }
  }

  function postTextFromElement(el) {
    const xText = el.querySelector('[data-testid="tweetText"]');
    if (xText && xText.textContent) return xText.textContent.trim();

    const generic = el.innerText || el.textContent || "";
    return generic.trim();
  }

  function pickLargestVisibleImage(root) {
    const imgs =
      root instanceof HTMLImageElement
        ? [root]
        : Array.from(root.querySelectorAll("img"));
    let best = null;
    let bestArea = 0;
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      const a = r.width * r.height;
      if (a < 48 * 48) continue;
      if (r.bottom < -80 || r.top > window.innerHeight + 80) continue;
      if (a > bestArea) {
        bestArea = a;
        best = img;
      }
    }
    return best;
  }

  function tryCaptureVideoFrame(root) {
    const videos =
      root instanceof HTMLVideoElement
        ? [root]
        : Array.from(root.querySelectorAll("video"));
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width * r.height < 64 * 64) continue;
      try {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) continue;
        const maxS = 1280;
        const scale = Math.min(1, maxS / Math.max(vw, vh));
        const tw = Math.max(1, Math.round(vw * scale));
        const th = Math.max(1, Math.round(vh * scale));
        const c = document.createElement("canvas");
        c.width = tw;
        c.height = th;
        const ctx = c.getContext("2d");
        ctx.drawImage(v, 0, 0, tw, th);
        const dataUrl = c.toDataURL("image/jpeg", 0.88);
        if (dataUrl && dataUrl.length > 400) return { imageBase64: dataUrl };
      } catch {
        /* CORS-tainted canvas or not ready */
      }
    }
    return null;
  }

  function tryCaptureImageDataUrl(img) {
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      const maxS = 1280;
      const scale = Math.min(1, maxS / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, tw, th);
      return c.toDataURL("image/jpeg", 0.88);
    } catch {
      return null;
    }
  }

  /**
   * Prefer a video frame; else largest visible image (canvas or URL for background fetch).
   * @returns {{ imageBase64?: string, imageUrl?: string } | null}
   */
  function captureMediaForCheckAi(root) {
    const v = tryCaptureVideoFrame(root);
    if (v) return v;
    const img = pickLargestVisibleImage(root);
    if (!img) return null;
    const dataUrl = tryCaptureImageDataUrl(img);
    if (dataUrl) return { imageBase64: dataUrl };
    const url = img.currentSrc || img.getAttribute("src") || "";
    if (url && !url.startsWith("blob:") && /^https?:\/\//i.test(url)) return { imageUrl: url };
    return null;
  }

  function mountCheckAiPanel(host) {
    let panel = host.querySelector(".veritas-check-ai-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "veritas-check-ai-panel";
      host.appendChild(panel);
    }
    return panel;
  }

  function renderCheckAiResult(panel, { aiProbability, verdict, explanation }) {
    const pct = clamp(Math.round(Number(aiProbability)), 0, 100);
    const isAi = verdict === "AI-generated";
    panel.innerHTML = "";
    const card = document.createElement("div");
    card.className = "veritas-check-ai-card";
    const head = document.createElement("div");
    head.className = "veritas-check-ai-head";
    const title = document.createElement("span");
    title.className = "veritas-check-ai-title";
    title.textContent = "Check AI";
    const ver = document.createElement("span");
    ver.className = `veritas-check-ai-verdict ${isAi ? "veritas-check-ai-verdict--ai" : "veritas-check-ai-verdict--real"}`;
    ver.textContent = verdict;
    head.appendChild(title);
    head.appendChild(ver);

    const meter = document.createElement("div");
    meter.className = "veritas-check-ai-meter";
    meter.innerHTML = `<span>AI probability</span><strong>${pct}%</strong>`;

    const barWrap = document.createElement("div");
    barWrap.className = "veritas-check-ai-bar";
    const bar = document.createElement("span");
    bar.style.width = `${pct}%`;
    barWrap.appendChild(bar);

    const expl = document.createElement("p");
    expl.className = "veritas-check-ai-expl";
    expl.textContent = String(explanation || "");

    card.appendChild(head);
    card.appendChild(meter);
    card.appendChild(barWrap);
    card.appendChild(expl);
    panel.appendChild(card);
  }

  async function checkAiAnalyze(payload) {
    if (!payload) {
      throw new Error("No capturable image or video in this post.");
    }
    const bg = await sendMessageToExtension({ type: "VERITAS_CHECK_AI", ...payload });
    if (bg && bg.ok === true && bg.data) return bg.data;
    if (bg && bg.ok === false) {
      throw new Error(formatExtensionMessagingError(bg?.error || "Check AI failed"));
    }
    if (payload.imageBase64) {
      const resp = await fetch(`${API_BASE}/check-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: payload.imageBase64 }),
      });
      if (!resp.ok) throw new Error(`Check AI failed: ${resp.status}`);
      return resp.json();
    }
    throw new Error("Could not load image (extension background unreachable). Refresh the page and try again.");
  }

  function attachCheckAiToHost(host, captureRoot) {
    if (host.querySelector(".veritas-check-ai-btn")) return;

    const row = document.createElement("div");
    row.className = "veritas-check-ai-row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "veritas-check-ai-btn";
    btn.textContent = "Check AI";
    btn.addEventListener("click", async () => {
      const panel = mountCheckAiPanel(host);
      panel.innerHTML =
        '<div class="veritas-check-ai-card veritas-check-ai-card--loading">Analyzing image…</div>';
      btn.disabled = true;
      try {
        const payload = captureMediaForCheckAi(captureRoot);
        const result = await checkAiAnalyze(payload);
        renderCheckAiResult(panel, result);
      } catch (e) {
        const msg = escapeHtml(String(e?.message || e));
        panel.innerHTML = `<div class="veritas-check-ai-card veritas-check-ai-card--err">${msg}</div>`;
      } finally {
        btn.disabled = false;
      }
    });
    row.appendChild(btn);
    host.appendChild(row);
  }

  function findPrimaryInstagramReelVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    let best = null;
    let bestArea = 0;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < 120 * 160) continue;
      if (r.bottom < -40 || r.top > window.innerHeight + 40) continue;
      if (area > bestArea) {
        bestArea = area;
        best = v;
      }
    }
    return best;
  }

  function ensureReelVideoToken(video) {
    let t = video.getAttribute("data-veritas-reel-id");
    if (!t) {
      reelVideoIdSeq += 1;
      t = `vr_${reelVideoIdSeq}_${Date.now().toString(36)}`;
      video.setAttribute("data-veritas-reel-id", t);
    }
    return t;
  }

  /**
   * Instagram Reels full-screen player usually has no <article>, so feed scanning never runs.
   * Mount a top-right overlay on the main reel video's parent.
   */
  function scanInstagramReelCheckAi() {
    if (!isInstagram) return;
    injectStyleOnce();

    if (!isInstagramReelSurface()) {
      document.querySelectorAll("[data-veritas-reel-checkai-host]").forEach((n) => n.remove());
      return;
    }

    document.querySelectorAll("[data-veritas-reel-checkai-host]").forEach((host) => {
      const token = host.getAttribute("data-veritas-for-video");
      const still = token && document.querySelector(`video[data-veritas-reel-id="${token}"]`);
      if (!still) host.remove();
    });

    const video = findPrimaryInstagramReelVideo();
    if (!video) return;

    const token = ensureReelVideoToken(video);
    const existing = document.querySelector(
      `[data-veritas-reel-checkai-host][data-veritas-for-video="${token}"]`
    );
    if (existing && existing.isConnected) return;

    document.querySelectorAll(`[data-veritas-reel-checkai-host][data-veritas-for-video="${token}"]`).forEach((n) => {
      if (n !== existing) n.remove();
    });

    const parent = video.parentElement;
    if (!parent) return;

    const cs = getComputedStyle(parent);
    if (cs.position === "static") parent.style.position = "relative";

    const host = document.createElement("div");
    host.setAttribute("data-veritas-reel-checkai-host", "1");
    host.setAttribute("data-veritas-for-video", token);
    host.className = "veritas-ig-reel-overlay";

    const captureRoot = parent;
    parent.appendChild(host);
    attachCheckAiToHost(host, captureRoot);
  }

  function findCandidatePosts() {
    const set = new Set();
    for (const sel of ["article", '[role="article"]']) {
      document.querySelectorAll(sel).forEach((node) => {
        if (node && node.nodeType === 1) set.add(node);
      });
    }
    const all = Array.from(set);
    return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  }

  async function analyze(text) {
    const body = {
      text,
      username: "",
      source: "extension",
    };

    // https:// pages cannot fetch http://localhost (mixed content). Service worker can.
    const bg = await sendMessageToExtension({ type: "VERITAS_ANALYZE", ...body });
    if (bg) {
      if (bg.ok === true && bg.data) return bg.data;
      throw new Error(formatExtensionMessagingError(bg?.error || "Analyze failed"));
    }

    const resp = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Analyze failed: ${resp.status}`);
    return resp.json();
  }

  function renderCard({ finalScore, aiGeneratedProbability, explanation }) {
    const score = clamp(Math.round(finalScore), 0, 100);
    const aiProbPct = clamp(Math.round(Number(aiGeneratedProbability) * 100), 0, 100);
    const t = tone(score);

    const card = document.createElement("div");
    card.className = "veritas-card";

    const row = document.createElement("div");
    row.className = "veritas-row";

    const badge = document.createElement("div");
    badge.className = "veritas-badge";
    badge.textContent = `Veritas: ${score}%`;

    const pill = document.createElement("div");
    pill.className = "veritas-pill";
    pill.innerHTML = `<span class="veritas-score">${aiProbPct}%</span>&nbsp;AI likelihood`;

    const status = document.createElement("div");
    status.className = "veritas-pill";
    status.innerHTML =
      t === "ok"
        ? `<span class="veritas-ok">High credibility</span>`
        : t === "mid"
          ? `<span style="color:#FDE68A">Medium credibility</span>`
          : `<span class="veritas-warn">Low credibility</span>`;

    row.appendChild(badge);
    row.appendChild(pill);
    row.appendChild(status);

    const insight = document.createElement("div");
    insight.className = "veritas-insight";
    insight.innerHTML = `<b>Veritas Insight:</b> ${escapeHtml(explanation || "")}`;

    const aiFlag = document.createElement("div");
    aiFlag.className = "veritas-insight";
    aiFlag.innerHTML =
      aiProbPct >= 60
        ? `<span class="veritas-warn">⚠ Possibly AI-generated</span>`
        : `<span class="veritas-ok">Likely human-authored</span>`;

    card.appendChild(row);
    card.appendChild(aiFlag);
    card.appendChild(insight);
    return card;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensurePostToolbarHost(el) {
    let host = el.querySelector("[data-veritas-post-host]");
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-veritas-post-host", "1");
      host.className = "veritas-post-toolbar";
      el.appendChild(host);
    }
    return host;
  }

  async function processPost(el) {
    if (el.getAttribute(TAG_ATTR) === "1") return;
    el.setAttribute(TAG_ATTR, "1");

    const host = ensurePostToolbarHost(el);
    attachCheckAiToHost(host, el);

    const text = postTextFromElement(el);
    if (!text || text.length < 10) return;

    try {
      const result = await analyze(text);
      const card = renderCard(result);
      host.appendChild(card);
    } catch {
      /* backend down — Check AI still available */
    }
  }

  function scanFeed() {
    injectStyleOnce();
    const posts = findCandidatePosts();
    for (const el of posts) processPost(el);
  }

  function runSocialAccountScanners() {
    if (isX) scanXAccountBadges();
    if (isLinkedIn) scanLinkedInAccountBadges();
    if (isReddit) scanRedditAccountBadges();
  }

  if (isInstagram) {
    const runIg = () => {
      scanInstagram();
      scanFeed();
      scanInstagramReelCheckAi();
    };
    runIg();
    const obs = new MutationObserver(() => {
      window.clearTimeout(scanInstagram._t);
      scanInstagram._t = window.setTimeout(runIg, 500);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return;
  }

  runSocialAccountScanners();
  scanFeed();

  const obs = new MutationObserver(() => {
    window.clearTimeout(scanFeed._t);
    scanFeed._t = window.setTimeout(() => {
      runSocialAccountScanners();
      scanFeed();
    }, 650);
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
