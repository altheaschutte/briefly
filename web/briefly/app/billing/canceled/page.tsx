"use client";

import Link from "next/link";
import { Ban, ArrowLeft } from "lucide-react";

export default function BillingCanceledPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0a1018] via-[#0a1018] to-[#0d1521] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-tealSoft/80">Billing</p>
          <h1 className="text-3xl font-semibold">Checkout canceled</h1>
          <p className="text-sm text-muted">
            Your Stripe checkout was canceled before completion. You can restart whenever you&apos;re ready.
          </p>
        </header>

        <div className="glass-panel flex flex-col gap-6 p-6">
          <div className="flex items-start gap-4">
            <Ban className="h-6 w-6 text-orange-300" />
            <div className="space-y-1">
              <p className="text-lg font-semibold">No charge was made</p>
              <p className="text-sm text-muted">
                If this was a mistake, jump back to the subscription page and open the Stripe portal to pick a plan.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/subscription"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <ArrowLeft className="h-4 w-4" />
              Manage subscription
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-borderSoft px-4 py-3 text-sm font-semibold text-white transition hover:border-teal"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
