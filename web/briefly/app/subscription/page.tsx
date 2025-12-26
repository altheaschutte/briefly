"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertCircle,
  ExternalLink,
  Loader2
} from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { BillingTier, BillingTierInfo, Entitlements, SubscriptionStatus } from "@/lib/types";
import { createStripeCheckoutSession, createStripePortalSession, fetchBillingTiers, fetchEntitlements } from "@/lib/api";

type TierPresentation = BillingTierInfo & {
  name: string;
  description: string;
  badge?: string;
};

const tierOrder: BillingTier[] = ["free", "starter", "pro", "power"];
const portalEligibleStatuses: SubscriptionStatus[] = ["active","past_due"];

const formatTierName = (tier: BillingTier) => (tier === "free" ? "Free Trial" : tier.charAt(0).toUpperCase() + tier.slice(1));

const describeTier = (tier: BillingTierInfo) => tier.description?.trim() || "Subscription tier.";

function formatMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "Unlimited minutes";
  if (minutes >= 120 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hr/mo`;
  }
  return `${minutes} min/mo`;
}

export default function SubscriptionPage() {
  const session = useRequireAuth();
  const accessToken = session?.access_token;
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [tiers, setTiers] = useState<BillingTierInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [redirectingTier, setRedirectingTier] = useState<BillingTier | null>(null);

  const currentTier = entitlements?.tier;
  const shouldManageViaPortal = entitlements ? portalEligibleStatuses.includes(entitlements.status) : false;
  const displayedTiers: TierPresentation[] = useMemo(() => {
    const sorted = [...tiers].sort(
      (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
    );
    return sorted.map((tier) => ({
      ...tier,
      name: formatTierName(tier.tier),
      description: describeTier(tier)
    }));
  }, [tiers]);

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [ents, tierList] = await Promise.all([
        fetchEntitlements(accessToken),
        fetchBillingTiers(accessToken)
      ]);
      setEntitlements(ents);
      setTiers(tierList ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load subscription");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const goToPortal = async () => {
    if (!accessToken) return;
    setPortalLoading(true);
    setError(null);
    try {
      const { url } = await createStripePortalSession(accessToken);
      if (!url) {
        throw new Error("Stripe portal is unavailable right now.");
      }
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message ?? "Could not open Stripe portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleTierClick = async (tier: BillingTier) => {
    if (!accessToken) return;
    setRedirectingTier(tier);
    setError(null);
    try {
      if (!entitlements) {
        await loadData();
        return;
      }
      if (shouldManageViaPortal) {
        await goToPortal();
        return;
      }
      if (tier === "free") {
        setError("Free tier is available automatically. Use the Stripe portal to cancel a paid plan.");
        return;
      }
      const { url } = await createStripeCheckoutSession(accessToken, tier);
      if (!url) {
        throw new Error("Stripe checkout is unavailable right now.");
      }
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message ?? "Could not start Stripe checkout");
    } finally {
      setRedirectingTier(null);
    }
  };


  return (
    <div className="container space-y-10 ">
     
      <section className="space-y-4 flex flex-col items-center justify-center">
        <h1 className="mb-8 text-center text-2xl font-semibold text-white">Manage your Subscription</h1>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {displayedTiers.map((tier) => {
            const isCurrent = currentTier === tier.tier;
            const tierCurrency = (tier.priceCurrency ?? "USD").toUpperCase();
            const hasPrice = tier.priceAmount !== null && tier.priceAmount !== undefined;
            const priceValue =
              hasPrice
                ? new Intl.NumberFormat("en-US", { style: "currency", currency: tierCurrency }).format((tier.priceAmount ?? 0) / 100)
                : tier.tier === "free"
                  ? new Intl.NumberFormat("en-US", { style: "currency", currency: tierCurrency }).format(0)
                  : tier.limits?.minutesPerMonth === null || tier.limits?.minutesPerMonth === undefined
                    ? "—"
                    : tier.limits.minutesPerMonth.toLocaleString();
            const priceSuffix =
              hasPrice || tier.tier === "free"
                ? "/month"
                : tier.limits?.minutesPerMonth
                  ? "min / month"
                  : "/ month";

            return (
              <div
                key={tier.tier}
                className={clsx(
                  "group flex h-full flex-col rounded-3xl border p-5 text-left text-white shadow-lg transition hover:-translate-y-1 hover:shadow-2xl",
                  isCurrent
                    ? "border-accent/80 bg-gradient-to-br from-accent/20 via-[#0c2232] to-[#08121f] ring-2 ring-accent/60"
                    : "border-borderSoft/60 bg-gradient-to-br from-[#0f1e2d] via-[#0b1623] to-[#0a1220]"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold uppercase tracking-[0.14em] text-tealSoft">{tier.name}</div>
                  {isCurrent && <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">Current</span>}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight text-white">{priceValue}</span>
                  <span className="text-sm font-semibold text-tealSoft/90">{priceSuffix}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{tier.description}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-tealSoft">
                  {formatMinutes(tier.limits?.minutesPerMonth)}
                </p>
                {isCurrent ? (
                  <div className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
                    Current plan
                  </div>
                ) : (
                  <button
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-70"
                    onClick={() => handleTierClick(tier.tier)}
                    disabled={loading || portalLoading || redirectingTier === tier.tier}
                  >
                    {redirectingTier === tier.tier ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    {shouldManageViaPortal ? "Manage in Stripe" : "Buy Plan"}
                  </button>
                )}
              </div>
            );
          })}
          {!loading && displayedTiers.length === 0 && (
            <div className="glass-panel rounded-3xl border border-borderSoft/70 p-4 text-sm text-muted">
              No tiers available. Refresh or check billing configuration.
            </div>
          )}
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
