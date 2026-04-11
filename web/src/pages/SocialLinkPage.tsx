import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../lib/api";
import { useApp } from "../state/appState";
import { Button, Card, Input, ProfileMenu, Shell } from "../components/Ui";

export default function SocialLinkPage() {
  const nav = useNavigate();
  const { user, setUser, logout, refreshUser } = useApp();
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [redditUsername, setRedditUsername] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const avatarSrc = useMemo(
    () => user?.faceImageUrl || user?.faceCaptureDataUrl || "",
    [user?.faceImageUrl, user?.faceCaptureDataUrl]
  );

  useEffect(() => {
    if (!user) {
      nav("/");
      return;
    }
    if (!user.isHumanVerified) {
      nav("/verify");
      return;
    }
    setLinkedinUrl(user.linkedinUrl || "");
    setRedditUsername(user.redditUsername || "");
    setInstagramHandle(user.instagramHandle || "");
    setXHandle(user.xHandle || "");
  }, [user, nav]);

  useEffect(() => {
    if (!user?._id) return;
    refreshUser().catch(() => {});
  }, [user?._id, refreshUser]);

  const saveAndContinue = async () => {
    if (!user?._id) return;
    setErr("");
    const li = linkedinUrl.trim();
    const rd = redditUsername.trim();
    const ig = instagramHandle.trim();
    const xh = xHandle.trim();
    const hasAny = Boolean(li || rd || ig || xh);

    if (!hasAny) {
      nav("/dashboard");
      return;
    }

    setLoading(true);
    try {
      const resp = await api.post<{ user: User }>("/user/link-social", {
        userId: user._id,
        linkedinUrl: li,
        redditUsername: rd,
        instagramHandle: ig,
        xHandle: xh,
      });
      setUser(resp.data.user);
      nav("/dashboard");
    } catch (e: unknown) {
      const any = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(any?.response?.data?.error || any?.message || "Could not save links. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const skip = () => {
    nav("/dashboard");
  };

  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm text-gray-400">Step 3</div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Link your social accounts</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Connect the profiles you use so Veritas can align your trust layer with your public identity. You can add or
            change these later from the dashboard.
          </p>
        </div>
        <ProfileMenu
          username={user?.username || "Not logged in"}
          avatarSrc={avatarSrc}
          walletId={user?.walletId}
          onConnectWallet={() => {
            // eslint-disable-next-line no-console
            console.log("Connect wallet clicked");
          }}
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

      <Card className="max-w-2xl">
        <div className="text-sm font-semibold text-white">Platforms</div>
        <p className="mt-1 text-xs text-gray-400">All fields are optional. Leave blank and skip if you prefer.</p>

        <div className="mt-6 space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-300">LinkedIn</label>
            <Input
              className="mt-1.5"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/your-profile"
              autoComplete="url"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-300">Reddit</label>
            <Input
              className="mt-1.5"
              value={redditUsername}
              onChange={(e) => setRedditUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-300">Instagram</label>
            <Input
              className="mt-1.5"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@handle or handle"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-300">X (Twitter)</label>
            <Input
              className="mt-1.5"
              value={xHandle}
              onChange={(e) => setXHandle(e.target.value)}
              placeholder="@handle or handle"
              autoComplete="username"
            />
          </div>
        </div>

        {err ? <div className="mt-4 text-sm text-rose-300">{err}</div> : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={skip}
            disabled={loading}
            className="rounded-xl border border-white/15 bg-transparent px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-white/5 disabled:opacity-50"
          >
            Skip for now
          </button>
          <Button type="button" onClick={saveAndContinue} disabled={loading}>
            {loading ? "Saving…" : "Continue to dashboard"}
          </Button>
        </div>
      </Card>
    </Shell>
  );
}
