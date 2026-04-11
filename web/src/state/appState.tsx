import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "../lib/api";
import { getLocalFaceCapture, removeLocalFaceCapture, setLocalFaceCapture } from "../lib/localFaceCapture";
import { clearSocialStepForUser } from "../lib/socialOnboarding";
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

function mergeLocalFaceCapture(u: User | null): User | null {
  if (!u?._id) return u;
  const local = getLocalFaceCapture(u._id);
  return local ? { ...u, faceCaptureDataUrl: local } : u;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return mergeLocalFaceCapture(parseStoredUser(raw));
  });

  useEffect(() => {
    if (user) {
      const slim = stripFaceCaptureDataUrl(user);
      localStorage.setItem(LS_KEY, JSON.stringify(slim));
      if (user.faceCaptureDataUrl) {
        setLocalFaceCapture(user._id, user.faceCaptureDataUrl);
      }
    } else {
      localStorage.removeItem(LS_KEY);
    }
  }, [user]);

  const refreshUser = async () => {
    if (!user?._id) return;
    const resp = await api.get<{ user: User }>(`/user/${user._id}`);
    const localFace = getLocalFaceCapture(user._id);
    let next = stripFaceCaptureDataUrl(resp.data.user);
    if (localFace) next = { ...next, faceCaptureDataUrl: localFace };
    setUser(next);
  };

  const logout = () => {
    if (user?._id) {
      removeLocalFaceCapture(user._id);
      clearSocialStepForUser(user._id);
    }
    setUser(null);
  };

  const value = useMemo(() => ({ user, setUser, refreshUser, logout }), [user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}

