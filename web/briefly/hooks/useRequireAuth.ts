"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function useRequireAuth() {
  const { token, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (!token) {
      router.replace("/");
    }
  }, [isReady, token, router]);

  return token;
}
