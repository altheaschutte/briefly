"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthToken } from "@/lib/types";
import { clearAuthStorage, loadStoredAuth, login as supabaseLogin, persistAuth } from "@/lib/auth";

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

  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored.token) setToken(stored.token);
    if (stored.email) setEmail(stored.email);
    setIsReady(true);
  }, []);

  const handleLogin = async (emailInput: string, password: string) => {
    const auth = await supabaseLogin(emailInput, password);
    setToken(auth);
    setEmail(emailInput);
    persistAuth(auth, emailInput);
    router.push("/home");
  };

  const handleLogout = () => {
    clearAuthStorage();
    setToken(null);
    setEmail(null);
    router.push("/");
  };

  const value = useMemo(
    () => ({
      token,
      email,
      isReady,
      login: handleLogin,
      logout: handleLogout
    }),
    [token, email, isReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
