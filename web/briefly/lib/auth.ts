"use client";

import { AuthToken } from "./types";

const AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_AUTH_URL ||
  "http://127.0.0.1:54321";

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const TOKEN_KEY = "briefly:auth";
const EMAIL_KEY = "briefly:email";

export function loadStoredAuth(): { token: AuthToken | null; email: string | null } {
  if (typeof window === "undefined") {
    return { token: null, email: null };
  }
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    const email = window.localStorage.getItem(EMAIL_KEY);
    if (!raw) return { token: null, email };
    const parsed = JSON.parse(raw) as AuthToken;
    return { token: parsed, email };
  } catch {
    return { token: null, email: null };
  }
}

export function persistAuth(token: AuthToken, email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  window.localStorage.setItem(EMAIL_KEY, email);
}

export function clearAuthStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
}

export async function login(email: string, password: string): Promise<AuthToken> {
  if (!ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const res = await fetch(`${AUTH_BASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({ email, password })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login failed: ${res.status}`);
  }

  const data = (await res.json()) as AuthToken;
  return data;
}
