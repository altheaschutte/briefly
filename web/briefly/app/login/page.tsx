"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { token, login, isReady } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isReady && token) {
      router.replace("/");
    }
  }, [isReady, token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center gap-10">
      <div className="w-full max-w-xl space-y-4">
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <span className="text-xs uppercase tracking-[0.2em] text-tealSoft">Briefly web app</span>
        </div>
        <h1 className="text-4xl font-semibold text-white md:text-5xl">Sign in</h1>
        <p className="text-base text-muted">
          Use the same account as iOS. Once signed in, you can pull your library, manage topics, tweak settings, and handle billing.
        </p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm text-muted">
            Email
            <div className="flex items-center gap-2 rounded-lg bg-overlay px-3 py-2 text-white">
              <Mail className="h-4 w-4 text-tealSoft" />
              <input
                type="email"
                placeholder="you@briefly.fm"
                className="w-full bg-transparent text-white outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </label>
          <label className="block space-y-1 text-sm text-muted">
            Password
            <div className="flex items-center gap-2 rounded-lg bg-overlay px-3 py-2 text-white">
              <Lock className="h-4 w-4 text-tealSoft" />
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-transparent text-white outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </label>
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-70"
            type="submit"
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-100">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted">
          <Image src="/briefly-logo.png" alt="Briefly logo" width={32} height={32} className="rounded-lg" />
          <span>Library · Create · Settings · Billing</span>
        </div>
      </div>
    </div>
  );
}
