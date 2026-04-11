/** Strip zero-width / BOM and surrounding quotes from pasted text. */
function cleanPaste(raw: string): string {
  return raw
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    /** Clipboard often adds newlines inside long URLs */
    .replace(/[\n\r\v\f]+/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
}

/** Normalize pasted text into a URL when possible. */
function toUrl(raw: string): URL | null {
  const t = cleanPaste(raw);
  if (!t) return null;
  try {
    return new URL(t.includes("://") ? t : `https://${t}`);
  } catch {
    return null;
  }
}

const RESERVED_IG = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "accounts",
  "direct",
  "tv",
  "publishing",
  "_u",
]);

/** Instagram sometimes prefixes the path with a locale: /en/username/ */
const IG_LOCALE = /^(?:[a-z]{2}(?:-[a-z]{2,4})?)$/i;

export type SocialPlatformKey = "reddit" | "instagram" | "x" | "linkedin";

export type ParsedSocialForApi = {
  linkedinUrl?: string;
  redditUsername?: string;
  instagramHandle?: string;
  xHandle?: string;
};

function isInstagramHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return (
    h === "instagram.com" ||
    h.endsWith(".instagram.com") ||
    h === "instagr.am" ||
    h === "ig.me"
  );
}

/**
 * Pull username from pathname; skip one leading locale segment if present.
 */
function extractInstagramHandleFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  /** Path like /en only — not a profile */
  if (parts.length === 1 && IG_LOCALE.test(parts[0])) return null;

  let idx = 0;
  if (parts.length >= 2 && IG_LOCALE.test(parts[0])) {
    idx = 1;
  }
  /** Mobile web profile URLs: /_u/handle/ */
  if (parts[idx] === "_u" && parts.length > idx + 1) {
    idx += 1;
  }

  const seg = parts[idx];
  if (!seg) return null;
  const lower = seg.toLowerCase();
  if (RESERVED_IG.has(lower)) return null;

  const handle = decodeURIComponent(seg).replace(/^@/, "").split("?")[0];
  if (!handle || !/^[\w.]+$/.test(handle)) return null;
  return handle.toLowerCase();
}

function parseInstagramFromUrl(url: URL): ParsedSocialForApi | { error: string } {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  /** Short links: resolve redirect params to the real profile URL */
  if (host === "l.instagram.com" || host.endsWith(".l.instagram.com")) {
    let jump: string | null = null;
    for (const k of ["u", "url", "href", "next"]) {
      const v = url.searchParams.get(k);
      if (v) {
        jump = v;
        break;
      }
    }
    if (jump) {
      try {
        let decoded = decodeURIComponent(jump.replace(/\+/g, " "));
        if (decoded.startsWith("//")) decoded = `https:${decoded}`;
        if (decoded.startsWith("/") && !decoded.startsWith("//")) {
          decoded = `https://www.instagram.com${decoded}`;
        }
        const nested = toUrl(decoded);
        if (nested) return parseInstagramFromUrl(nested);
      } catch {
        /* fall through */
      }
    }
    return { error: "Open the profile in a browser and copy the address bar URL (l.instagram.com links need the profile URL)." };
  }

  if (!isInstagramHost(host)) {
    return { error: "Not an Instagram link." };
  }

  const handle = extractInstagramHandleFromPathname(url.pathname);
  if (handle) return { instagramHandle: handle };

  return { error: "Use your profile link, e.g. instagram.com/yourusername" };
}

/**
 * Plain handle with no URL: my.name or @my.name
 */
function tryInstagramPlainText(raw: string): ParsedSocialForApi | null {
  const t = cleanPaste(raw);
  if (!t || /:\/\//.test(t)) return null;
  const h = t.replace(/^@/, "").trim();
  if (!/^[\w.]{1,30}$/.test(h)) return null;
  return { instagramHandle: h.toLowerCase() };
}

/**
 * Extracts profile identifiers from a pasted URL for the given platform.
 * Returns `{ error: string }` if the link cannot be parsed.
 */
export function parsePastedSocialLink(
  platform: SocialPlatformKey,
  raw: string
): ParsedSocialForApi | { error: string } {
  if (platform === "instagram") {
    const plain = tryInstagramPlainText(raw);
    if (plain) return plain;
  }

  const url = toUrl(raw);
  if (!url) {
    if (platform === "instagram") {
      return { error: "Paste your profile URL (e.g. instagram.com/username) or your @username." };
    }
    return { error: "Paste a valid link or URL." };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  switch (platform) {
    case "reddit": {
      if (!host.includes("reddit.com")) return { error: "Not a Reddit link." };
      const m = url.pathname.match(/\/(?:user|u)\/([^/?#]+)/i);
      if (!m?.[1]) return { error: "Could not find a Reddit username in this link." };
      return { redditUsername: decodeURIComponent(m[1]).replace(/^u\//i, "") };
    }
    case "instagram":
      return parseInstagramFromUrl(url);
    case "x": {
      if (!host.includes("x.com") && !host.includes("twitter.com")) {
        return { error: "Not an X (Twitter) profile link." };
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const seg = parts[0];
      if (!seg) return { error: "Could not find a handle in this link." };
      const blocked = new Set(["home", "i", "intent", "search", "settings", "messages", "compose", "explore"]);
      if (blocked.has(seg.toLowerCase())) {
        return { error: "Use a profile URL (e.g. x.com/handle)." };
      }
      return { xHandle: seg.replace(/^@/, "") };
    }
    case "linkedin": {
      if (!host.includes("linkedin.com")) return { error: "Not a LinkedIn link." };
      const m = url.pathname.match(/\/in\/([^/?#]+)/i);
      if (!m?.[1]) return { error: "Use a profile URL containing /in/…" };
      const slug = decodeURIComponent(m[1]);
      const canonical = `https://www.linkedin.com/in/${slug}/`;
      return { linkedinUrl: canonical };
    }
    default:
      return { error: "Unknown platform." };
  }
}
