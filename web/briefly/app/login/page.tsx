"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getProfile } from "@/lib/profile";

export default function LoginPage() {
  const { session, isReady, requestOtp, verifyOtp } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (isReady && session) {
      getProfile(supabase, session.user.id)
        .then((profile) => {
          const hasAbout = Boolean(profile?.user_about_context && profile.user_about_context.trim());
          router.replace(hasAbout ? "/subscription" : "/onboarding");
        })
        .catch(() => {
          router.replace("/subscription");
        });
    }
  }, [isReady, session, router]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestOtp(email);
      setCodeSent(true);
      setStatus("Check your email for a 6-digit code.");
    } catch (err: any) {
      setError(err?.message ?? "Could not send code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setStatus(null);
    const supabase = getSupabaseBrowserClient();
    try {
      await verifyOtp(email, code);
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        const profile = await getProfile(supabase, userId);
        const hasAbout = Boolean(profile?.user_about_context && profile.user_about_context.trim());
        router.replace(hasAbout ? "/subscription" : "/onboarding");
      } else {
        router.replace("/subscription");
      }
    } catch (err: any) {
      setError(err?.message ?? "Invalid or expired code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = getSupabaseBrowserClient();
    setSubmitting(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin
      }
    });

    if (authError) {
      setSubmitting(false);
      setError(authError.message);
    }
  };

  return (
    <div className="container flex min-h-[70vh] flex-col items-center justify-center gap-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <Image
            src="/briefly-logo.png"
            alt="Briefly logo"
            width={72}
            height={72}
            className="rounded-2xl"
            priority
          />
          <p className="text-sm uppercase tracking-[0.3em] text-tealSoft md:text-base">Briefly</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:opacity-70"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
            <path
              d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
              fill="#EA4335"
            ></path>
            <path
              d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
              fill="#4285F4"
            ></path>
            <path
              d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
              fill="#FBBC05"
            ></path>
            <path
              d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
              fill="#34A853"
            ></path>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-white/60">
          <div className="h-px flex-1 bg-white/15" />
          <span className="text-xs font-semibold uppercase tracking-[0.25em]">Or</span>
          <div className="h-px flex-1 bg-white/15" />
        </div>

        <form className="space-y-4" onSubmit={codeSent ? handleVerify : handleRequest}>
          <label className="block space-y-1  text-muted">
            <span className="mb-2 text-sm">Email</span>
            <div className="flex items-center gap-2 rounded-lg bg-overlay px-3 py-2 text-white focus-within:ring-1 focus-within:ring-tealSoft">
             
              <input
                type="email"
                placeholder="name@example.com"
                className="w-full bg-transparent text-white outline-none "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={codeSent || submitting}
              />
            </div>
          </label>
          {codeSent && (
            <label className="block space-y-1  text-muted">
            <span className="mb-2 text-sm">6-digit code</span>
              <div className="flex items-center gap-2 rounded-lg bg-overlay px-3 py-2 text-white focus-within:ring-1 focus-within:ring-tealSoft">
                <Lock className="h-4 w-4 text-tealSoft" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  className="w-full bg-transparent text-white outline-none"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
            </label>
          )}
          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-70"
            type="submit"
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {codeSent ? (submitting ? "Verifying..." : "Verify code") : submitting ? "Sending code..." : "Continue"}
          </button>
        </form>
        {status && !error && (
          <div className="flex items-center gap-2 text-sm text-tealSoft">
            <CheckCircle className="h-4 w-4" />
            {status}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-100">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      
      </div>
    </div>
  );
}
