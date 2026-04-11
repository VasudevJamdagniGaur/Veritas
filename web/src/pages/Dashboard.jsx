import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { deleteVeritasAccount } from "../lib/deleteAccount";
import { parsePastedSocialLink } from "../lib/parseSocialProfileUrl";
import { useApp } from "../state/appState";
import { ProfileMenu, Shell } from "../components/Ui";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function scoreTone(score) {
  if (score >= 71) return { bar: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" };
  if (score >= 40) return { bar: "bg-amber-500", pill: "bg-amber-500/15 text-amber-200 border-amber-400/30" };
  return { bar: "bg-rose-500", pill: "bg-rose-500/15 text-rose-200 border-rose-400/30" };
}

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${className}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition hover:border-white/20 hover:bg-white/[0.07] ${className}`}
    >
      {children}
    </div>
  );
}

function Progress({ value }) {
  const v = clamp(Number(value) || 0, 0, 100);
  const t = scoreTone(v);
  return (
    <div className="h-2 w-full rounded-full bg-white/10">
      <div className={`h-2 rounded-full ${t.bar}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function TrustCard({ user }) {
  const trust = clamp(user.trustScore ?? 72, 0, 100);
  const verified = Boolean(user.isHumanVerified);
  const trustT = scoreTone(trust);

  return (
    <Card className="lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Trust overview</div>
          <div className="mt-1 text-lg font-semibold text-white">Your trust profile</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={`border ${trustT.pill}`}>⭐ Trust: {trust}</Pill>
          <Pill className={`border ${verified ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : "bg-white/5 text-gray-200 border-white/10"}`}>
            🟢 Human Verified: {verified ? "Yes" : "No"}
          </Pill>
        </div>
      </div>

      <div className="mt-5">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-gray-400">Trust Score</div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div className="text-4xl font-semibold text-white">{trust}</div>
            <div className="text-xs text-gray-400">out of 100</div>
          </div>
          <div className="mt-3">
            <Progress value={trust} />
          </div>
          <div className="mt-2 text-xs text-gray-400">Higher trust improves credibility scoring in the extension.</div>
        </div>
      </div>
    </Card>
  );
}

export function ExtensionCard({ onInstall }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-[#E91E63]/15 blur-2xl" />
      <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-[#E91E63]/10 blur-2xl" />

      <div className="relative">
        <div className="text-xs uppercase tracking-wide text-gray-400">Activate</div>
        <div className="mt-1 text-lg font-semibold text-white">Activate Veritas on Social Media</div>
        <p className="mt-2 text-sm text-gray-300">
          Detect fake news, flag bot accounts, and show credibility scores directly in your feed.
        </p>

        <ul className="mt-4 space-y-2 text-sm text-gray-300">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Credibility badge per post
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-300" />
            AI-generated likelihood
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-300" />
            “Veritas Insight” explanation
          </li>
        </ul>

        <button
          type="button"
          onClick={onInstall}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#E91E63] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(233,30,99,0.25)] transition hover:brightness-110"
        >
          Install Chrome Extension
          <span className="transition group-hover:translate-x-0.5">→</span>
        </button>
      </div>
    </Card>
  );
}

function SocialConnectRow({ platformKey, label, connected, detail, userId, onLinked }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (!parsed || "error" in parsed) return;
    setSaving(true);
    try {
      const resp = await api.post("/user/link-social", {
        userId,
        ...parsed,
      });
      onLinked(resp.data.user);
      setInput("");
      setOpen(false);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "Could not save.";
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
            type="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste profile URL (https://…)"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-500 focus:border-[#E91E63]/50"
          />
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

export function AccountCard({ user, userId, onLinked }) {
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
    <Card>
      <div className="text-xs uppercase tracking-wide text-gray-400">Connected account</div>
      <div className="mt-1 text-lg font-semibold text-white">Social identity</div>

      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <SocialConnectRow
            key={row.key}
            platformKey={row.key}
            label={row.label}
            connected={row.connected}
            detail={row.detail}
            userId={userId}
            onLinked={onLinked}
          />
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { user, setUser, logout, refreshUser } = useApp();

  const mockUser = useMemo(
    () => ({
      username: "verified_user",
      trustScore: 72,
      isHumanVerified: true,
      twitter: "@verified_user",
    }),
    []
  );

  const viewUser = user || mockUser;

  useEffect(() => {
    if (!user) return; // allow mock dashboard for demo visuals even without login
    if (!user.isHumanVerified) nav("/verify");
  }, [user, nav]);

  useEffect(() => {
    if (!user?._id) return;
    refreshUser().catch(() => {});
  }, [user?._id, refreshUser]);

  return (
    <Shell>
      <div className="mb-6">
        <div className="text-sm text-gray-400">Dashboard</div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold text-white">Welcome, {viewUser.username}</h1>
            <p className="mt-1 text-xs text-gray-400">
              <span className="text-pink-200">Veritas</span> • Trust Layer for Social Media
            </p>
          </div>
          <ProfileMenu
            username={viewUser.username}
            avatarSrc={user?.faceImageUrl || user?.faceCaptureDataUrl || ""}
            walletId={user?.walletId}
            onDeleteAccount={
              user?._id
                ? async (close) => {
                    close();
                    try {
                      await deleteVeritasAccount(user._id);
                    } catch (e) {
                      // eslint-disable-next-line no-console
                      console.error(e);
                      window.alert("Could not delete your account. Try again.");
                      return;
                    }
                    logout();
                    localStorage.removeItem("veritas.pendingUsername");
                    nav("/");
                  }
                : undefined
            }
            subtextWhenEmpty="No verification photo on file"
            subtextWhenPhoto="Verification capture"
            footer={(close) => (
              <button
                type="button"
                onClick={() => {
                  close();
                  logout();
                  nav("/");
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Log out
              </button>
            )}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <TrustCard user={viewUser} />
        <ExtensionCard onInstall={() => { console.log("Install extension clicked"); nav("/instructions"); }} />
        <AccountCard user={viewUser} userId={user?._id} onLinked={setUser} />
      </div>
    </Shell>
  );
}

