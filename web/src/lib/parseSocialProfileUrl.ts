/** Normalize pasted text into a URL when possible. */
function toUrl(raw: string): URL | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return new URL(t.includes("://") ? t : `https://${t}`);
  } catch {
    return null;
  }
}

const RESERVED_IG = new Set(["p", "reel", "reels", "stories", "explore", "accounts", "direct", "tv"]);

export type SocialPlatformKey = "reddit" | "instagram" | "x" | "linkedin";

export type ParsedSocialForApi = {
  linkedinUrl?: string;
  redditUsername?: string;
  instagramHandle?: string;
  xHandle?: string;
};

/**
 * Extracts profile identifiers from a pasted URL for the given platform.
 * Returns `{ error: string }` if the link cannot be parsed.
 */
export function parsePastedSocialLink(
  platform: SocialPlatformKey,
  raw: string
): ParsedSocialForApi | { error: string } {
  const url = toUrl(raw);
  if (!url) return { error: "Paste a valid link or URL." };

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  switch (platform) {
    case "reddit": {
      if (!host.includes("reddit.com")) return { error: "Not a Reddit link." };
      const m = url.pathname.match(/\/(?:user|u)\/([^/?#]+)/i);
      if (!m?.[1]) return { error: "Could not find a Reddit username in this link." };
      return { redditUsername: decodeURIComponent(m[1]).replace(/^u\//i, "") };
    }
    case "instagram": {
      if (!host.includes("instagram.com")) return { error: "Not an Instagram link." };
      const parts = url.pathname.split("/").filter(Boolean);
      const first = parts[0];
      if (!first || RESERVED_IG.has(first.toLowerCase())) {
        return { error: "Use a profile URL (e.g. instagram.com/username)." };
      }
      return { instagramHandle: first.split("?")[0].toLowerCase() };
    }
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
