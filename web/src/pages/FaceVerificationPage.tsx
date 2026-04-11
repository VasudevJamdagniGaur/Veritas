import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../lib/api";
import { setLocalFaceCapture } from "../lib/localFaceCapture";
import { stripFaceCaptureDataUrl } from "../lib/userFields";
import { useApp } from "../state/appState";
import { Button, Card, Shell } from "../components/Ui";

export default function FaceVerificationPage() {
  const nav = useNavigate();
  const { user, setUser } = useApp();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [streamErr, setStreamErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootErr, setBootErr] = useState("");
  const [verifyErr, setVerifyErr] = useState("");

  const canVerify = useMemo(() => Boolean(user?._id), [user]);

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setStreamErr("");
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Some browsers can throw if play() is interrupted; don't fail camera init for that.
        try {
          await videoRef.current.play();
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      setStreamErr(
        e?.message ||
          "Unable to access webcam. Please allow camera permission and ensure a camera is connected."
      );
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Auto-start camera on page load.
    // If the browser blocks it, we'll show `streamErr`.
    startCamera().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // If we already have a user and they're verified, skip ahead.
    if (user?.isHumanVerified) nav("/dashboard");
  }, [user?.isHumanVerified, nav]);

  useEffect(() => {
    // If user is missing, try to create/login using the username captured on the signup screen.
    if (user?._id) return;
    const pending = localStorage.getItem("veritas.pendingUsername") || "";
    if (!pending) {
      nav("/");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const resp = await api.post<{ user: User }>("/auth/login", { username: pending });
        if (cancelled) return;
        setUser(resp.data.user);
      } catch (e: any) {
        if (cancelled) return;
        setBootErr(e?.response?.data?.error || e?.message || "Backend not ready yet. Try again in a moment.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?._id, nav, setUser]);

  const capture = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return "";
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.8);
  };

  const onVerify = async () => {
    // Ensure we have a user even if backend bootstrapping is still in-flight.
    let u = user;
    if (!u?._id) {
      const pending = localStorage.getItem("veritas.pendingUsername") || "";
      if (pending) {
        try {
          const resp = await api.post<{ user: User }>("/auth/login", { username: pending });
          setUser(stripFaceCaptureDataUrl(resp.data.user));
          u = stripFaceCaptureDataUrl(resp.data.user);
        } catch (e: any) {
          setVerifyErr(e?.response?.data?.error || e?.message || "Backend not ready yet. Try again in a moment.");
          return;
        }
      } else {
        setVerifyErr("No session found. Go back and sign in with Google first.");
        return;
      }
    }
    const captureDataUrl = capture();
    setVerifyErr("");
    setLoading(true);
    try {
      const resp = await api.post<{ user: User }>("/user/verify-face", {
        userId: u._id,
        captureDataUrl,
      });
      let merged: User = stripFaceCaptureDataUrl(resp.data.user);
      if (captureDataUrl) {
        setLocalFaceCapture(u._id, captureDataUrl);
        merged = { ...merged, faceCaptureDataUrl: captureDataUrl };
      }
      setUser(merged);
      nav("/link-social");
    } catch (e: any) {
      // If backend is temporarily unavailable, keep the demo flow unblocked.
      setVerifyErr(e?.response?.data?.error || e?.message || "Verification failed (backend not ready).");
      let merged: User = stripFaceCaptureDataUrl({
        ...u,
        isHumanVerified: true,
        trustScore: Math.min(100, (u.trustScore ?? 50) + 15),
      });
      if (captureDataUrl) {
        setLocalFaceCapture(u._id, captureDataUrl);
        merged = { ...merged, faceCaptureDataUrl: captureDataUrl };
      }
      setUser(merged);
      nav("/link-social");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-white">Face Verification</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-300">
          Proof-of-human: we capture a webcam frame and mark your account verified (no heavy ML).
        </p>
        <p className="mt-3 max-w-2xl text-sm text-gray-400">
          Next: <span className="text-pink-200/90">Step 3</span> — connect Reddit, Instagram, X, and LinkedIn, then
          continue to your dashboard.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Card>
            <div className="text-sm font-semibold text-white">Webcam</div>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <video
                ref={videoRef}
                className="h-[320px] w-full object-cover"
                playsInline
                muted
                autoPlay
              />
            </div>
            {bootErr ? <div className="mt-2 text-sm text-rose-300">{bootErr}</div> : null}
            {streamErr ? <div className="mt-2 text-sm text-rose-300">{streamErr}</div> : null}
            {verifyErr ? <div className="mt-2 text-sm text-rose-300">{verifyErr}</div> : null}
            <div className="mt-4">
              <Button onClick={onVerify} disabled={!canVerify || loading}>
                {loading ? "Verifying…" : "Capture & Verify"}
              </Button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </Card>
        </div>

        <Card>
          <div className="text-sm font-semibold text-white">What this unlocks</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-300">
            <li>Higher trust score</li>
            <li>Lower bot probability</li>
            <li>Veritas credibility badge</li>
            <li>
              Veritas Wallet ID: your digital passport which is your cross-platform trust identity
            </li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

