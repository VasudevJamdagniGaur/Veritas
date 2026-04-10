import React from "react";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#121212] text-gray-100">
      <div className="mx-auto w-full max-w-5xl px-5 py-10">{children}</div>
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

