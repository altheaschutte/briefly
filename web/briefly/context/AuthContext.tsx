"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthToken } from "@/lib/types";
import {
  clearAuthStorage,
  loadStoredAuth,
  login as supabaseLogin,
  persistAuth,
  refreshSession,
  shouldRefreshToken
} from "@/lib/auth";
import { setUnauthorizedHandler } from "@/lib/api";

type AuthState = {
  token: AuthToken | null;
  email: string | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<AuthToken | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const refreshInFlight = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored.token) setToken(stored.token);
    if (stored.email) setEmail(stored.email);
    setIsReady(true);
  }, []);

  const handleLogin = useCallback(
    async (emailInput: string, password: string) => {
      clearRefreshTimer();
      const auth = await supabaseLogin(emailInput, password);
      setToken(auth);
      setEmail(emailInput);
      persistAuth(auth, emailInput);
      router.push("/");
    },
    [clearRefreshTimer, router]
  );

  const handleLogout = useCallback(
    (redirectToLogin = true) => {
      clearRefreshTimer();
      clearAuthStorage();
      setToken(null);
      setEmail(null);
      if (redirectToLogin) {
        router.replace("/login");
      } else {
        router.push("/");
      }
    },
    [clearRefreshTimer, router]
  );

  const refreshAccessToken = useCallback(async () => {
    if (!token?.refresh_token || refreshInFlight.current) return token;
    refreshInFlight.current = true;
    try {
      const refreshed = await refreshSession(token.refresh_token);
      setToken(refreshed);
      persistAuth(refreshed, email ?? "");
      return refreshed;
    } catch (err) {
      console.error("Failed to refresh auth token", err);
      handleLogout(true);
      return null;
    } finally {
      refreshInFlight.current = false;
    }
  }, [token, email, handleLogout]);

  useEffect(() => {
    setUnauthorizedHandler(() => handleLogout(true));
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  useEffect(() => {
    if (!token) {
      clearRefreshTimer();
      return;
    }

    if (shouldRefreshToken(token)) {
      refreshAccessToken();
    }

    if (!token.refresh_token || !token.expires_at) {
      clearRefreshTimer();
      return;
    }

    const refreshAtMs = token.expires_at * 1000 - 60_000;
    const delay = Math.max(refreshAtMs - Date.now(), 15_000);

    clearRefreshTimer();
    refreshTimer.current = window.setTimeout(() => {
      refreshAccessToken();
    }, delay);

    return clearRefreshTimer;
  }, [token, refreshAccessToken, clearRefreshTimer]);

  const logout = useCallback(() => handleLogout(true), [handleLogout]);

  const value = useMemo(
    () => ({
      token,
      email,
      isReady,
      login: handleLogin,
      logout
    }),
    [token, email, isReady, handleLogin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
