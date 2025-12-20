"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FocusEvent } from "react";
import { Menu, X, Headphones, LogOut, LogIn, CircleUser, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { createStripePortalSession } from "@/lib/api";

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const router = useRouter();
  const { token, email, logout } = useAuth();

  const handleAccountBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
      setAccountOpen(false);
    }
  };

  const handleManageBilling = async () => {
    if (!token) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const { url } = await createStripePortalSession(token.access_token);
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

  return (
    <header className="sticky top-0 z-30 bg-gradient-to-b from-[#0f1d2c] via-[#0f1d2c] to-transparent">
      <div className="container relative flex items-center justify-center py-4">
        <Link href="/" className="text-white">
          <div className="flex items-center gap-3">
          <Image
            src="/briefly-logo.png"
            alt="Briefly"
            width={40}
            height={40}
            className="rounded-xl"
          />
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Briefly</p>
          </div>
        </Link>

        <div className="absolute right-0 flex items-center justify-end gap-2">
          <nav className="hidden items-center gap-2 md:flex">
            {token ? (
              <>
            
                <div
                  className="relative"
                  onMouseEnter={() => setAccountOpen(true)}
                  onMouseLeave={() => setAccountOpen(false)}
                  onFocus={() => setAccountOpen(true)}
                  onBlur={handleAccountBlur}
                >
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-borderSoft px-3 py-2 text-sm font-semibold text-white transition hover:border-teal"
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                  >
                    <CircleUser className="h-5 w-5" />
                    <span className="hidden lg:inline">{email ?? "Account"}</span>
                  </button>
                  <div
                    className={clsx(
                      "absolute right-0 top-full w-64 pt-2 transition",
                      accountOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0"
                    )}
                  >
                    <div className="rounded-2xl border border-borderSoft/80 bg-overlay/90 p-3 shadow-xl backdrop-blur transition">
                    
                      <div className="mt-2 flex flex-col gap-1 text-sm">
                        <button
                          onClick={handleManageBilling}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-white transition hover:bg-overlay/80 disabled:opacity-60"
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
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-white transition hover:bg-overlay/80"
                        >
                          <LogOut className="h-4 w-4 text-muted" />
                          Logout
                        </button>
                      </div>
                      {billingError && <p className="mt-2 text-xs text-red-200">{billingError}</p>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Login
              </button>
            )}
          </nav>

          <button
            className="inline-flex items-center rounded-full bg-transparent p-2 text-white md:hidden"
            onClick={() => setOpen((prev) => !prev)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-6 pb-6 pt-2 md:hidden">
          <div className="flex flex-col gap-3">
            {token ? (
              <>
                <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 p-4 text-left">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-tealSoft">Account</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{email ?? "Unknown user"}</p>
                </div>
            
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-borderSoft px-4 py-3 text-sm font-semibold text-white transition hover:border-teal disabled:opacity-60"
                  onClick={() => {
                    setOpen(false);
                    handleManageBilling();
                  }}
                  disabled={billingLoading}
                >
                  {billingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Manage billing
                  <ExternalLink className="h-3 w-3 text-muted" />
                </button>
                {billingError && <p className="text-center text-xs text-red-200">{billingError}</p>}
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white transition hover:opacity-80"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Logout {email ? `(${email})` : ""}
                </button>
              </>
            ) : (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
                onClick={() => {
                  setOpen(false);
                  router.push("/login");
                }}
              >
                <LogIn className="h-4 w-4" />
                Login
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
