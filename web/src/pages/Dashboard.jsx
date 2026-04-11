import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { deleteVeritasAccount } from "../lib/deleteAccount";
import { isSocialStepComplete } from "../lib/socialOnboarding";
import { useApp } from "../state/appState";
import SocialIdentityCard from "../components/SocialIdentityCard.jsx";
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
    if (!user.isHumanVerified) {
      nav("/verify");
      return;
    }
    if (user._id && !isSocialStepComplete(user._id)) {
      nav("/link-social");
    }
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
        <SocialIdentityCard className="lg:col-span-3" user={viewUser} userId={user?._id} onLinked={setUser} />
      </div>
    </Shell>
  );
}

