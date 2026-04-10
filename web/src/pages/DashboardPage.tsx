import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type User } from "../lib/api";
import { useApp } from "../state/appState";
import { Badge, Button, Card, Input, ScoreBar, Shell } from "../components/Ui";

type Post = {
  _id: string;
  content: string;
  aiScore: number;
  aiGeneratedProbability: number;
  finalScore: number;
  explanation: string;
  username?: string;
  createdAt: string;
};

function toneForScore(score: number) {
  if (score >= 70) return "green" as const;
  if (score >= 45) return "yellow" as const;
  return "red" as const;
}

export default function DashboardPage() {
  const nav = useNavigate();
  const { user, setUser, refreshUser, logout } = useApp();
  const [socialHandle, setSocialHandle] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) nav("/login");
  }, [user, nav]);

  useEffect(() => {
    if (!user) return;
    setSocialHandle(user.socialHandle || "");
    setSocialUrl(user.socialUrl || "");
  }, [user]);

  const verificationBadge = useMemo(() => {
    if (!user) return { label: "Not logged in", tone: "gray" as const };
    return user.isHumanVerified
      ? { label: "Human Verified", tone: "green" as const }
      : { label: "Not Verified", tone: "red" as const };
  }, [user]);

  const loadPosts = async () => {
    const resp = await api.get<{ posts: Post[] }>("/posts");
    setPosts(resp.data.posts);
  };

  useEffect(() => {
    loadPosts().catch(() => {});
  }, []);

  const onLink = async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      const resp = await api.post<{ user: User }>("/user/link-social", {
        userId: user._id,
        socialHandle: socialHandle.trim(),
        socialUrl: socialUrl.trim(),
      });
      setUser(resp.data.user);
    } finally {
      setLoading(false);
    }
  };

  const onLogout = () => {
    logout();
    nav("/login");
  };

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-400">Dashboard</div>
          <h1 className="mt-1 text-3xl font-semibold text-white">Welcome{user ? `, ${user.username}` : ""}</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            This is your trust profile. The extension uses it to adjust the final credibility score.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={verificationBadge.label} tone={verificationBadge.tone} />
          <Button onClick={() => refreshUser()} disabled={!user}>
            Refresh
          </Button>
          <Button onClick={onLogout}>Logout</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="text-sm font-semibold text-white">Trust & Bot Scores</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">Trust score</div>
                <Badge label={`${user?.trustScore ?? 0}/100`} tone={toneForScore(user?.trustScore ?? 0)} />
              </div>
              <div className="mt-2">
                <ScoreBar value={user?.trustScore ?? 0} />
              </div>
              <div className="mt-2 text-xs text-gray-400">
                Increases with verification + positive behavior.
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">Bot probability</div>
                <Badge label={`${user?.botScore ?? 0}/100`} tone={toneForScore(100 - (user?.botScore ?? 0))} />
              </div>
              <div className="mt-2">
                <ScoreBar value={100 - (user?.botScore ?? 0)} />
              </div>
              <div className="mt-2 text-xs text-gray-400">Lower is better. New/unverified accounts trend higher.</div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-white">Link social</div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="mb-1 text-xs text-gray-400">Handle</div>
              <Input value={socialHandle} onChange={(e) => setSocialHandle(e.target.value)} placeholder="@yourhandle" />
            </div>
            <div>
              <div className="mb-1 text-xs text-gray-400">Profile URL</div>
              <Input
                value={socialUrl}
                onChange={(e) => setSocialUrl(e.target.value)}
                placeholder="https://x.com/yourhandle"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={onLink} disabled={!user || loading}>
                {loading ? "Linking…" : "Save"}
              </Button>
              <Link className="text-sm text-pink-200 hover:underline" to="/instructions">
                Install extension →
              </Link>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Recent analyzed posts</div>
              <div className="mt-1 text-xs text-gray-400">Seeded examples + anything analyzed by the extension.</div>
            </div>
            <Button onClick={() => loadPosts()} disabled={loading}>
              Reload posts
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            {posts.map((p) => (
              <div key={p._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-gray-400">{p.username || "unknown"}</div>
                  <div className="flex items-center gap-2">
                    <Badge label={`Final ${p.finalScore}%`} tone={toneForScore(p.finalScore)} />
                    <Badge label={`AI ${Math.round(p.aiGeneratedProbability * 100)}%`} tone="gray" />
                  </div>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{p.content}</div>
                <div className="mt-2 text-sm text-gray-300">
                  <span className="text-pink-200">Veritas Insight:</span> {p.explanation}
                </div>
              </div>
            ))}
            {posts.length === 0 ? <div className="text-sm text-gray-400">No posts yet.</div> : null}
          </div>
        </Card>
      </div>
    </Shell>
  );
}

