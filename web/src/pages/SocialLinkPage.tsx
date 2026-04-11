import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../state/appState";
import SocialIdentityCard from "../components/SocialIdentityCard.jsx";
import { Button, Shell } from "../components/Ui";

export default function SocialLinkPage() {
  const nav = useNavigate();
  const { user, setUser, refreshUser } = useApp();

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    if (!user.isHumanVerified) {
      nav("/verify");
      return;
    }
  }, [user, nav]);

  useEffect(() => {
    if (!user?._id) return;
    refreshUser().catch(() => {});
  }, [user?._id, refreshUser]);

  const goDashboard = () => {
    nav("/dashboard");
  };

  if (!user) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Redirecting…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6">
        <div className="text-sm text-gray-400">Step 3</div>
        <h1 className="mt-1 text-3xl font-semibold text-white">Link your social accounts</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-300">
          Connect the profiles you use so Veritas can align your trust layer with your public identity. Click{" "}
          <span className="text-pink-200/90">Connect</span> on a platform, then paste your profile URL or @handle. You
          can update these anytime from the dashboard.
        </p>
      </div>

      <SocialIdentityCard user={user} userId={user._id} onLinked={setUser} className="w-full" />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={goDashboard}
          className="rounded-xl border border-white/15 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-white/5"
        >
          Skip for now
        </button>
        <Button type="button" onClick={goDashboard}>
          Continue to dashboard
        </Button>
      </div>
    </Shell>
  );
}
