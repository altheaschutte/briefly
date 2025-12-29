"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getProfile } from "@/lib/profile";

export function useRequireAuth() {
  const { session, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const enforceProfile = async () => {
      try {
        const profile = await getProfile(supabase, session.user.id);
        const hasAbout = Boolean(profile?.user_about_context && profile.user_about_context.trim());
        if (!hasAbout) {
          router.replace("/onboarding");
        }
      } catch (err) {
        console.error("Failed to fetch profile for gate", err);
      }
    };
    enforceProfile();
  }, [isReady, session, router]);

  return session;
}
