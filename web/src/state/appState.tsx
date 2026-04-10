import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, type User } from "../lib/api";

type AppState = {
  user: User | null;
  setUser: (u: User | null) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<AppState | null>(null);

const LS_KEY = "veritas.user";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(LS_KEY, JSON.stringify(user));
    else localStorage.removeItem(LS_KEY);
  }, [user]);

  const refreshUser = async () => {
    if (!user?._id) return;
    const resp = await api.get<{ user: User }>(`/user/${user._id}`);
    setUser(resp.data.user);
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

