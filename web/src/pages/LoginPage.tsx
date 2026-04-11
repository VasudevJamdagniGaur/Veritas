import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../lib/api";
import { useApp } from "../state/appState";
import { Card, Input, Shell } from "../components/Ui";

/** Served from `web/public/media/`. Order: A → B → A → … at 0.4× */
const base = import.meta.env.BASE_URL;
const OPENING_BG_VIDEOS = [`${base}media/hero-rotate-a.mp4`, `${base}media/hero-rotate-b.mp4`] as const;

export default function LoginPage() {
  const nav = useNavigate();
  const { user, setUser } = useApp();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (user?.username) setUsername(user.username);
  }, [user?.username]);

  const canNext = useMemo(() => username.trim().length >= 2 && !loading, [username, loading]);

  const finish = async (userResp: { user: User }) => {
    setUser(userResp.user);
  };

  const onNext = async () => {
    setErr("");
    setLoading(true);
    try {
      const desired = username.trim();
      // Always proceed to face verification immediately; it will create/login the user if needed.
      localStorage.setItem("veritas.pendingUsername", desired);
      nav("/verify");

      let currentUser = user;
      if (!currentUser?._id) {
        const resp = await api.post<{ user: User }>("/auth/login", { username: desired });
        await finish(resp.data);
        currentUser = resp.data.user;
      }

      if (desired && currentUser?._id && desired !== currentUser.username) {
        const resp = await api.post<{ user: User }>("/user/set-username", {
          userId: currentUser._id,
          username: desired,
        });
        setUser(resp.data.user);
        return;
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Unable to continue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell backgroundVideos={OPENING_BG_VIDEOS}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">Veritas</div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Trust Layer for Social Media</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Prove you’re human, build a trust score, and get credibility badges directly in your feed via the Chrome
            extension.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-1">
        <Card>
          <div className="text-sm font-semibold text-white">Sign up</div>
          <div className="mt-1 text-xs text-gray-400">Choose a username to continue.</div>
          <div className="mt-3 space-y-3">
            {err ? <div className="text-sm text-rose-300">{err}</div> : null}
            <div>
              <div className="mb-1 text-xs text-gray-400">Username</div>
              <div className="flex items-center gap-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_username"
                />
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!canNext}
                  className="inline-flex h-[38px] w-[42px] items-center justify-center rounded-xl bg-[#E91E63] text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Next"
                  title="Next"
                >
                  →
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                Click Next to continue.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

