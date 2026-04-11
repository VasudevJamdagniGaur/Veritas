import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { api, type User } from "../lib/api";
import { auth } from "../lib/firebase";
import { stripFaceCaptureDataUrl } from "../lib/userFields";
import { useApp } from "../state/appState";
import { Card, Shell } from "../components/Ui";

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const nav = useNavigate();
  const { setUser } = useApp();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const finish = async (userResp: { user: User }) => {
    setUser(stripFaceCaptureDataUrl(userResp.user));
  };

  const onGoogle = async () => {
    setErr("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();

      const resp = await api.post<{ user: User }>("/auth/google", { idToken });
      await finish(resp.data);

      const u = resp.data.user;
      if (u?.username) {
        localStorage.setItem("veritas.pendingUsername", u.username);
      }

      nav("/verify");
    } catch (e: unknown) {
      const any = e as { code?: string; message?: string };
      if (any?.code === "auth/popup-closed-by-user") {
        setErr("");
      } else {
        setErr(any?.message || "Google sign-in failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl lg:text-8xl">
          Veritas
        </h1>
        <p className="mt-3 text-xl font-medium text-pink-200/95 sm:text-2xl md:text-3xl">
          Trust Layer for Social Media
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
          Prove you’re human, build a trust score, and get credibility badges directly in your feed.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-1">
        <Card>
          <div className="text-sm font-semibold text-white">Sign up</div>
          <div className="mt-1 text-xs text-gray-400">Use your Google account to create a Veritas profile.</div>
          <div className="mt-5">
            {err ? <div className="mb-3 text-sm text-rose-300">{err}</div> : null}
            <button
              type="button"
              onClick={onGoogle}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3.5 text-sm font-semibold text-gray-900 shadow-lg shadow-black/20 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleMark />
              {loading ? "Connecting…" : "Continue with Google"}
            </button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
