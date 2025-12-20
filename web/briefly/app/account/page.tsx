"use client";

import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/context/AuthContext";
import { createStripePortalSession, fetchEntitlements } from "@/lib/api";
import { BadgeCheck, CreditCard, Receipt, User, Shield, ExternalLink, Loader2, AlertCircle } from "lucide-react";

const invoices = [
  { id: "inv_001", date: "Mar 28, 2025", amount: "$9.00", status: "Paid" },
  { id: "inv_002", date: "Feb 28, 2025", amount: "$9.00", status: "Paid" },
  { id: "inv_003", date: "Jan 28, 2025", amount: "$9.00", status: "Paid" }
];

export default function AccountPage() {
  const token = useRequireAuth();
  const { email } = useAuth();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<string | null>(null);

  const openPortal = async () => {
    if (!token) return;
    setLoadingPortal(true);
    setError(null);
    try {
      const { url } = await createStripePortalSession(token.access_token);
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message ?? "Could not open Stripe portal");
    } finally {
      setLoadingPortal(false);
    }
  };

  const loadEntitlements = async () => {
    if (!token) return;
    try {
      const ents = await fetchEntitlements(token.access_token);
      setTier(ents.tier);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load entitlements");
    }
  };

  return (
    <div className="container space-y-12">
      <header className="glass-panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Account</p>
            <h1 className="text-3xl font-semibold text-white">Manage your plan and billing</h1>
            <p className="text-sm text-muted">
              Web is where you manage Stripe billing, payment methods, and invoices. Matches your iOS subscription status.
            </p>
          </div>
          <div className="rounded-full border border-borderSoft/70 px-4 py-2 text-xs text-muted">
            Current plan: {tier ?? "Unknown"}{" "}
            <button className="text-tealSoft underline" onClick={loadEntitlements}>
              refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 text-white">
              <CreditCard className="h-5 w-5 text-accent" />
              Billing via Stripe
            </div>
            <p className="text-sm text-muted">
              Update payment methods, swap tiers, or cancel. Changes sync to the iOS app immediately.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              <span className="pill">Prorated upgrades</span>
              <span className="pill">Download invoices</span>
              <span className="pill">Secure customer portal</span>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-70"
                onClick={openPortal}
                disabled={loadingPortal}
              >
                Open Stripe portal
                {loadingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              </button>
              <button className="rounded-full border border-borderSoft px-4 py-2 text-sm font-semibold text-white transition hover:border-teal">
                Update payment
              </button>
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 text-white">
              <User className="h-5 w-5 text-accent" />
              Profile
            </div>
            <p className="text-sm text-muted">Identity and contact info used across Briefly platforms.</p>
            <div className="mt-3 space-y-2 text-sm text-white">
              <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Email: {email ?? "—"}</div>
              <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Handle: @briefly_you</div>
            </div>
          </div>
        </div>
      </header>

      <section className="glass-panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-white">
            <BadgeCheck className="h-5 w-5 text-accent" />
            Invoices
          </div>
          <p className="text-sm text-muted">Export receipts for expenses. Data comes straight from Stripe.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-2xl border border-borderSoft/70 bg-overlay/70 p-4">
              <p className="text-sm font-semibold text-white">#{invoice.id}</p>
              <p className="text-xs text-muted">{invoice.date}</p>
              <p className="mt-2 text-lg font-semibold text-white">{invoice.amount}</p>
              <p className="text-xs text-tealSoft">{invoice.status}</p>
              <button className="mt-3 w-full rounded-full border border-borderSoft px-3 py-2 text-xs text-white transition hover:border-teal">
                Download PDF
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel grid gap-6 p-6 lg:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Shield className="h-5 w-5 text-accent" />
            Security
          </div>
          <p className="text-sm text-muted">Supabase auth with secure JWTs. Single sign-in for iOS and web.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Active sessions: Web · iPhone</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">2FA: Coming soon</div>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-white">
            <Receipt className="h-5 w-5 text-accent" />
            Plan details
          </div>
          <p className="text-sm text-muted">Briefly Plus · Monthly · Next renewal Apr 28, 2025.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Topic cap: 5 active</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Priority rendering: Enabled</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Downloads + CarPlay: Included</div>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-white">
            <ExternalLink className="h-5 w-5 text-accent" />
            Support
          </div>
          <p className="text-sm text-muted">Email support@briefly.fm for billing or account help.</p>
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Stripe portal access</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Invoices downloadable</div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">Response under 1 business day</div>
          </div>
        </div>
      </section>

      {error && (
        <div className="glass-panel flex items-center gap-2 p-4 text-sm text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
