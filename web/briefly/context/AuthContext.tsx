"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { setUnauthorizedHandler } from "@/lib/api";
import { showErrorSnackbar } from "@/lib/snackbar";

type AuthState = {
  session: Session | null;
  accessToken: string | null;
  email: string | null;
  isReady: boolean;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setEmail(data.session?.user?.email ?? null);
      setIsReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setEmail(nextSession?.user?.email ?? null);
      setIsReady(true);
    });

    setUnauthorizedHandler((message) => {
      showErrorSnackbar(message || "Session expired. Please sign in again.");
      supabase.auth.signOut();
      router.replace("/login");
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      setUnauthorizedHandler(null);
    };
  }, [router, supabase]);

  const requestOtp = useCallback(
    async (emailInput: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
    },
    [supabase]
  );

  const handleLogout = useCallback(
    async () => {
      await supabase.auth.signOut();
      setSession(null);
      setEmail(null);
      router.replace("/login");
    },
    [router, supabase]
  );

  const verifyOtp = useCallback(
    async (emailInput: string, token: string) => {
      const { data, error } = await supabase.auth.verifyOtp({
        email: emailInput,
        token,
        type: "email"
      });
      if (error) {
        throw error;
      }
      setSession(data.session ?? null);
      setEmail(data.session?.user?.email ?? emailInput ?? null);
    },
    [supabase]
  );

  const value = useMemo(
    () => ({
      session,
      accessToken: session?.access_token ?? null,
      email,
      isReady,
      requestOtp,
      verifyOtp,
      logout: handleLogout
    }),
    [session, email, isReady, requestOtp, verifyOtp, handleLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
