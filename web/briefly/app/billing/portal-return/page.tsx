"use client";

import Link from "next/link";
import { ExternalLink, Home } from "lucide-react";

export default function BillingPortalReturnPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a1018] via-[#0a1018] to-[#0d1521] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-tealSoft/80">Billing</p>
          <h1 className="text-3xl font-semibold">Portal closed</h1>
          <p className="text-sm text-muted">
            You returned from the Stripe customer portal. Changes to your subscription will reflect in the app within a few seconds.
          </p>
        </header>

        <div className="glass-panel flex flex-col gap-6 p-6">
          <div className="space-y-2">
            <p className="text-lg font-semibold">Next steps</p>
            <p className="text-sm text-muted">
              If you switched plans or updated payment details, reload Briefly or revisit your subscription page to confirm.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/subscription"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <ExternalLink className="h-4 w-4" />
              Manage subscription
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-borderSoft px-4 py-3 text-sm font-semibold text-white transition hover:border-teal"
            >
              <Home className="h-4 w-4" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
