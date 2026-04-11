import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { getExtractionPreview, parsePastedSocialLink } from "../lib/parseSocialProfileUrl";
import { Card } from "./Ui";

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${className}`}>
      {children}
    </span>
  );
}

function socialPayloadOk(platformKey, parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  switch (platformKey) {
    case "instagram":
      return Boolean(String(parsed.instagramHandle || "").trim());
    case "reddit":
      return Boolean(String(parsed.redditUsername || "").trim());
    case "x":
      return Boolean(String(parsed.xHandle || "").trim());
    case "linkedin":
      return Boolean(String(parsed.linkedinUrl || "").trim());
    default:
      return false;
  }
}

function SocialConnectRow({ platformKey, label, connected, detail, userId, accountUsername, onLinked }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const extractionPreview = useMemo(() => getExtractionPreview(platformKey, input), [platformKey, input]);

  const linkAccount = async () => {
    setErr("");
    if (!userId) {
      setErr("Sign in to connect.");
      return;
    }
    const parsed = parsePastedSocialLink(platformKey, input);
    if (parsed && "error" in parsed) {
      setErr(parsed.error);
      return;
    }
    if (!socialPayloadOk(platformKey, parsed)) {
      setErr("Could not read a username from that. Paste your profile URL from the browser bar or your @handle.");
      return;
    }
    setSaving(true);
    try {
      const resp = await api.post("/user/link-social", {
        userId,
        username: String(accountUsername || "").trim(),
        ...parsed,
      });
      onLinked(resp.data.user);
      setInput("");
      setOpen(false);
    } catch (e) {
      const data = e?.response?.data;
      let msg = data?.error || e?.message || "Could not save.";
      if (data?.details?.[0]) {
        const d = data.details[0];
        const hint = [d.path?.filter(Boolean).join("."), d.message].filter(Boolean).join(": ");
        if (hint) msg = `${msg} — ${hint}`;
      }
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-200">{label}</div>
        {connected ? (
          <Pill className="border bg-emerald-500/15 text-emerald-200 border-emerald-400/30">Connected</Pill>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setErr("");
            }}
            className="rounded-full border border-[#E91E63]/40 bg-[#E91E63]/15 px-3 py-1 text-xs font-semibold text-pink-100 transition hover:bg-[#E91E63]/25"
          >
            {open ? "Cancel" : "Connect"}
          </button>
        )}
      </div>
      <div className="mt-2 break-words text-sm text-gray-300">
        {connected ? detail : open ? null : "Click Connect, then paste your profile link."}
      </div>
      {!connected && open ? (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Profile URL, @handle, or username"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-[#E91E63]/50"
          />
          {extractionPreview ? (
            <div className="text-xs leading-snug text-emerald-300/90">{extractionPreview}</div>
          ) : null}
          {err ? <div className="text-xs text-rose-300">{err}</div> : null}
          <button
            type="button"
            disabled={saving || !input.trim()}
            onClick={linkAccount}
            className="w-full rounded-xl bg-[#E91E63] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Link account"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * “Connected account / Social identity” — four platform cards with Connect → paste link (same UI on Dashboard and Step 3).
 */
export default function SocialIdentityCard({ user, userId, onLinked, className = "" }) {
  const redditRaw = user.redditUsername || "";
  const igRaw = user.instagramHandle || "";
  const linkedinRaw = user.linkedinUrl || "";
  const xFromFields = user.xHandle || user.twitter || "";
  const xFromSocial =
    user.socialHandle &&
    (String(user.socialUrl || "").includes("x.com") || String(user.socialUrl || "").includes("twitter.com"))
      ? user.socialHandle
      : "";
  const xDisplay = xFromFields || xFromSocial || "";
  const xConnected = Boolean(
    user.xHandle ||
      user.twitter ||
      (user.socialHandle &&
        (String(user.socialUrl || "").includes("x.com") || String(user.socialUrl || "").includes("twitter.com")))
  );

  const redditDisplay = redditRaw ? `u/${String(redditRaw).replace(/^u\//i, "").replace(/^@/, "")}` : "";
  const igDisplay = igRaw ? `@${String(igRaw).replace(/^@/, "")}` : "";
  const xShow = xFromFields
    ? `@${String(xFromFields).replace(/^@/, "")}`
    : xFromSocial
      ? String(xFromSocial).startsWith("@")
        ? xFromSocial
        : `@${xFromSocial}`
      : "";

  const rows = [
    {
      key: "reddit",
      label: "Reddit",
      connected: Boolean(redditRaw),
      detail: redditDisplay,
    },
    {
      key: "instagram",
      label: "Instagram",
      connected: Boolean(igRaw),
      detail: igDisplay,
    },
    {
      key: "x",
      label: "X",
      connected: xConnected,
      detail: xShow,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      connected: Boolean(linkedinRaw),
      detail: linkedinRaw,
    },
  ];

  return (
    <Card className={className}>
      <div className="text-xs uppercase tracking-wide text-gray-400">Connected account</div>
      <div className="mt-1 text-lg font-semibold text-white">Social identity</div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <SocialConnectRow
            key={row.key}
            platformKey={row.key}
            label={row.label}
            connected={row.connected}
            detail={row.detail}
            userId={userId}
            accountUsername={user?.username}
            onLinked={onLinked}
          />
        ))}
      </div>
    </Card>
  );
}
