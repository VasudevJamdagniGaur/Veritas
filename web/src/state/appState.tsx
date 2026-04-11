import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "../lib/api";
import { loadFaceImageUrl } from "../lib/profileImageFirestore";
import { stripFaceCaptureDataUrl } from "../lib/userFields";

type AppState = {
  user: User | null;
  setUser: (u: User | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AppState | null>(null);

const LS_KEY = "veritas.user";

function parseStoredUser(raw: string): User | null {
  try {
    const u = JSON.parse(raw) as User;
    return stripFaceCaptureDataUrl(u);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return parseStoredUser(raw);
  });

  useEffect(() => {
    if (user) {
      const slim = stripFaceCaptureDataUrl(user);
      localStorage.setItem(LS_KEY, JSON.stringify(slim));
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }, [user]);

  /** Load Firestore-backed profile image URL when session user id is known. */
  useEffect(() => {
    if (!user?._id) return;
    let cancelled = false;
    loadFaceImageUrl(user._id)
      .then((url) => {
        if (cancelled || !url) return;
        setUser((prev) => {
          if (!prev) return prev;
          if (prev.faceImageUrl === url) return prev;
          return { ...stripFaceCaptureDataUrl(prev), faceImageUrl: url };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?._id]);

  const refreshUser = async () => {
    if (!user?._id) return;
    const resp = await api.get<{ user: User }>(`/user/${user._id}`);
    let next = stripFaceCaptureDataUrl(resp.data.user);
    const firestoreUrl = await loadFaceImageUrl(user._id).catch(() => null);
    if (firestoreUrl) next = { ...next, faceImageUrl: firestoreUrl };
    setUser(next);
  };

  const logout = () => setUser(null);

  const value = useMemo(() => ({ user, setUser, refreshUser, logout }), [user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}

