import React, { useCallback, useEffect, useRef } from "react";

/** 0.4× = 20% slower than previous 0.5× */
const HERO_VIDEO_RATE = 0.4;
/** Wall-clock crossfade; overlap uses video time = this × playback rate */
const CROSSFADE_MS = 520;
/** Trim from incoming head / outgoing tail at each handoff (seconds) */
const MERGE_TRIM_IN = 0.05;
const MERGE_TRIM_OUT = 0.05;
const BASE_OPACITY = 0.35;
/** Video timeline seconds overlapped during crossfade (matches wall-clock CROSSFADE_MS at HERO_VIDEO_RATE) */
const OVERLAP_VIDEO_S = (CROSSFADE_MS / 1000) * HERO_VIDEO_RATE;

function HeroVideoRotator({ sources }: { sources: readonly string[] }) {
  const ref0 = useRef<HTMLVideoElement>(null);
  const ref1 = useRef<HTMLVideoElement>(null);
  /** Which ref (0|1) currently carries the outgoing (playing) clip */
  const activeSlotRef = useRef<0 | 1>(0);
  const sourceIndexRef = useRef(0);
  const transitioningRef = useRef(false);

  const startCrossfade = useCallback(() => {
    if (sources.length < 2 || transitioningRef.current) return;
    const active = activeSlotRef.current;
    const incoming = (1 - active) as 0 | 1;
    const outV = active === 0 ? ref0.current : ref1.current;
    const inV = incoming === 0 ? ref0.current : ref1.current;
    if (!outV || !inV) return;

    const nextIdx = (sourceIndexRef.current + 1) % sources.length;
    const nextSrc = sources[nextIdx];
    if (!nextSrc) return;

    transitioningRef.current = true;

    const run = () => {
      inV.src = nextSrc;
      inV.muted = true;
      inV.defaultMuted = true;
      inV.playsInline = true;
      const onReady = () => {
        inV.removeEventListener("loadeddata", onReady);
        inV.currentTime = MERGE_TRIM_IN;
        inV.playbackRate = HERO_VIDEO_RATE;
        const p = inV.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }

        outV.style.zIndex = "1";
        inV.style.zIndex = "2";
        outV.style.transition = `opacity ${CROSSFADE_MS}ms cubic-bezier(0.33, 0, 0.2, 1)`;
        inV.style.transition = `opacity ${CROSSFADE_MS}ms cubic-bezier(0.33, 0, 0.2, 1)`;
        requestAnimationFrame(() => {
          outV.style.opacity = "0";
          inV.style.opacity = String(BASE_OPACITY);
        });

        window.setTimeout(() => {
          outV.pause();
          outV.removeAttribute("src");
          outV.load();
          outV.style.transition = "";
          outV.style.opacity = "0";
          outV.style.zIndex = "0";

          inV.style.transition = "";
          sourceIndexRef.current = nextIdx;
          activeSlotRef.current = incoming;
          transitioningRef.current = false;
        }, CROSSFADE_MS);
      };
      inV.addEventListener("loadeddata", onReady, { once: true });
    };

    run();
  }, [sources]);

  useEffect(() => {
    if (!sources.length) return;
    const v0 = ref0.current;
    if (!v0) return;

    sourceIndexRef.current = 0;
    activeSlotRef.current = 0;
    v0.src = sources[0];
    v0.muted = true;
    v0.playsInline = true;
    const onReady = () => {
      v0.removeEventListener("loadeddata", onReady);
      v0.currentTime = 0;
      v0.playbackRate = HERO_VIDEO_RATE;
      v0.style.opacity = String(BASE_OPACITY);
      v0.style.zIndex = "2";
      const p = v0.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
    };
    v0.addEventListener("loadeddata", onReady, { once: true });

    const onTime = () => {
      if (transitioningRef.current || sources.length < 2) return;
      const slot = activeSlotRef.current;
      const v = slot === 0 ? ref0.current : ref1.current;
      if (!v || !v.duration || !Number.isFinite(v.duration)) return;

      const d = v.duration;
      const endPlay = d - MERGE_TRIM_OUT;
      const triggerAt = Math.max(MERGE_TRIM_IN + 0.08, endPlay - OVERLAP_VIDEO_S);

      if (v.currentTime >= triggerAt) {
        startCrossfade();
      }
    };
    const el0 = ref0.current;
    const el1 = ref1.current;
    el0?.addEventListener("timeupdate", onTime);
    el1?.addEventListener("timeupdate", onTime);

    return () => {
      el0?.removeEventListener("timeupdate", onTime);
      el1?.removeEventListener("timeupdate", onTime);
    };
  }, [sources, startCrossfade]);

  if (!sources.length) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <video
        ref={ref0}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0 }}
        muted
        playsInline
        aria-hidden
      />
      <video
        ref={ref1}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0 }}
        muted
        playsInline
        aria-hidden
      />
    </div>
  );
}

export function Shell({
  children,
  backgroundVideos,
}: {
  children: React.ReactNode;
  /** Full-screen background clips (e.g. opening page); cycles in order, 0.4× speed. */
  backgroundVideos?: readonly string[];
}) {
  const hasBg = Boolean(backgroundVideos?.length);
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#121212] text-gray-100">
      {hasBg ? <HeroVideoRotator sources={backgroundVideos!} /> : null}
      {hasBg ? (
        <div
          className="pointer-events-none fixed inset-0 z-[1] bg-[#121212]/70 backdrop-blur-[1px]"
          aria-hidden
        />
      ) : null}
      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-10">{children}</div>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-[#E91E63] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#E91E63]/70 ${
        props.className || ""
      }`}
    />
  );
}

export function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "yellow" | "red" | "gray" | "pink";
}) {
  const map: Record<string, string> = {
    green: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
    yellow: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    red: "bg-rose-500/15 text-rose-200 border-rose-400/30",
    gray: "bg-white/5 text-gray-200 border-white/10",
    pink: "bg-[#E91E63]/15 text-pink-200 border-[#E91E63]/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${map[tone]}`}>
      {label}
    </span>
  );
}

export function ScoreBar({ value }: { value: number }) {
  const tone = value >= 70 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-2 w-full rounded-full bg-white/10">
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

