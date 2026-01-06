"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FocusEvent } from "react";
import { X, LogOut, LogIn, CircleUser, CreditCard, ExternalLink, Loader2, MessageSquare } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { createStripePortalSession } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getProfile } from "@/lib/profile";

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { session, accessToken, email, logout } = useAuth();
  const isLoginPage = pathname === "/login";
  const isProducerChat = pathname === "/producer-chat";

  const handleAccountBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
      setAccountOpen(false);
    }
  };

  const handleManageBilling = async () => {
    if (!session || !accessToken) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const { url } = await createStripePortalSession(accessToken);
      if (!url) {
        throw new Error("Stripe portal is unavailable right now.");
      }
      window.location.href = url;
    } catch (err: any) {
      setBillingError(err?.message ?? "Could not open Stripe billing");
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setFirstName(null);
      return;
    }

    let isMounted = true;
    const supabase = getSupabaseBrowserClient();
    const loadProfile = async () => {
      try {
        const profile = await getProfile(supabase, session.user.id);
        if (isMounted) {
          setFirstName(profile?.first_name ?? null);
        }
      } catch (err) {
        console.error("Failed to load profile for navigation", err);
        if (isMounted) {
          setFirstName(null);
        }
      }
    };
    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (isLoginPage) {
    return null;
  }

  const primaryName = firstName ?? email ?? null;

  return (
    <header
      className={clsx(
        "sticky top-0 z-30 transition-colors",
        scrolled ? "border-b border-borderSoft bg-white/80 backdrop-blur" : "bg-transparent"
      )}
    >
      <div
        className={clsx(
          "relative flex items-center justify-between py-4",
          isProducerChat ? "w-full px-6 lg:px-10" : "container"
        )}
      >
        <Link href="/" className="text-ink">
          <div className="flex items-center gap-3">
            <Image
              src="/briefly-logo.svg"
              alt="Briefly"
              width={90}
              height={23}
              className="h-auto w-[90px]"
              priority
            />
          </div>
        </Link>

        <div className="flex items-center justify-end gap-3 pr-2">
          <nav className="hidden items-center gap-2 md:flex">
            {session ? (
              <>
            
                <div
                  className="relative"
                  onMouseEnter={() => setAccountOpen(true)}
                  onMouseLeave={() => setAccountOpen(false)}
                  onFocus={() => setAccountOpen(true)}
                  onBlur={handleAccountBlur}
                >
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-borderSoft px-3 py-2 text-sm font-semibold text-ink transition hover:border-accent"
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                  >
                    <CircleUser className="h-5 w-5" />
                    <span className="hidden lg:inline">{primaryName ?? "Account"}</span>
                  </button>
                  <div
                    className={clsx(
                      "absolute right-0 top-full w-64 pt-2 transition",
                      accountOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
                    )}
                  >
                    <div className="rounded-2xl border border-borderSoft bg-surface/95 p-3 shadow-xl backdrop-blur transition">
                    
                      <div className="mt-2 flex flex-col gap-1 text-sm">
                        <button
                          onClick={() => {
                            setAccountOpen(false);
                            router.push("/subscription");
                          }}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-ink transition hover:bg-overlay/60"
                        >
                          <CircleUser className="h-4 w-4 text-muted" />
                          Subscription
                        </button>
                        <button
                          onClick={() => {
                            setAccountOpen(false);
                            router.push("/producer-chat");
                          }}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-ink transition hover:bg-overlay/60"
                        >
                          <MessageSquare className="h-4 w-4 text-muted" />
                          Producer chat
                        </button>
                        <button
                          onClick={handleManageBilling}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-ink transition hover:bg-overlay/60 disabled:opacity-60"
                          disabled={billingLoading}
                        >
                          {billingLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted" />
                          ) : (
                            <CreditCard className="h-4 w-4 text-muted" />
                          )}
                          <span className="flex items-center gap-1">
                            Manage billing
                            <ExternalLink className="h-3 w-3 text-muted" />
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            setAccountOpen(false);
                            logout();
                          }}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-ink transition hover:bg-overlay/60"
                        >
                          <LogOut className="h-4 w-4 text-muted" />
                          Logout
                        </button>
                      </div>
                      {billingError && <p className="mt-2 text-xs text-red-600">{billingError}</p>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              !isLoginPage && (
                <button
                  onClick={() => router.push("/login")}
                  className="inline-flex items-center gap-2 rounded-full bg-navBar px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  <LogIn className="h-4 w-4" />
                  Login
                </button>
              )
            )}
          </nav>

          <button
            className="inline-flex items-center rounded-full bg-transparent p-2 text-ink md:hidden"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <CircleUser className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        className={clsx(
          "fixed inset-0 z-40 overflow-hidden md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div
          className={clsx(
            "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          className={clsx(
            "absolute right-0 top-0 flex h-full w-80 max-w-[85%] flex-col gap-6 bg-white p-6 shadow-2xl ring-1 ring-borderSoft transition-transform duration-200",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          {session ? (
            <>
              <div className="pt-4">
                <p className="text-lg font-semibold text-ink">{primaryName ?? "Account"}</p>
                {email ? <p className="mt-1 text-sm text-muted">{email}</p> : null}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  className="inline-flex items-center justify-between gap-2 rounded-xl border border-borderSoft px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-60"
                  onClick={() => {
                    setOpen(false);
                    handleManageBilling();
                  }}
                  disabled={billingLoading}
                >
                  <span className="flex items-center gap-2">
                    {billingLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted" />
                    ) : (
                      <CreditCard className="h-4 w-4 text-muted" />
                    )}
                    Manage billing
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted" />
                </button>
                <button
                  className="inline-flex items-center justify-between gap-2 rounded-xl bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:bg-overlay/60"
                  onClick={() => {
                    setOpen(false);
                    router.push("/subscription");
                  }}
                >
                  <span className="flex items-center gap-2">
                    <CircleUser className="h-4 w-4 text-muted" />
                    Subscription
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted" />
                </button>
                <button
                  className="inline-flex items-center justify-between gap-2 rounded-xl bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:bg-overlay/60"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4 text-muted" />
                    Logout
                  </span>
                </button>
                {billingError && <p className="text-sm text-red-600">{billingError}</p>}
              </div>
            </>
          ) : (
            !isLoginPage && (
              <div className="pt-4">
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-navBar px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                  onClick={() => {
                    setOpen(false);
                    router.push("/login");
                  }}
                >
                  <LogIn className="h-4 w-4" />
                  Login
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  );
}
