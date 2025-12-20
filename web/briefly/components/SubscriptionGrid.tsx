import { subscriptionTiers } from "@/data/appContent";
import { Check } from "lucide-react";
import clsx from "clsx";

export default function SubscriptionGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={clsx("grid gap-6", compact ? "md:grid-cols-3" : "md:grid-cols-3 lg:grid-cols-3")}>
      {subscriptionTiers.map((tier) => (
        <div
          key={tier.name}
          className={clsx(
            "relative overflow-hidden rounded-3xl border border-borderSoft/80 bg-gradient-to-b from-overlay via-surface to-overlay p-6 shadow-glow transition hover:-translate-y-1 hover:border-teal hover:shadow-accent",
            tier.highlight && "ring-2 ring-accent"
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">{tier.name}</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">{tier.tagline}</h3>
            </div>
            {tier.highlight && (
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink shadow-accent">
                Most popular
              </span>
            )}
          </div>

          <div className="mt-6 flex items-baseline gap-2 text-white">
            <span className="text-4xl font-semibold">{tier.price}</span>
            <span className="text-sm text-muted">{tier.cadence}</span>
          </div>

          <div className="mt-5 space-y-3 text-sm text-muted">
            {tier.features.map((item) => (
              <div key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 text-teal" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-105">
            {tier.cta}
          </button>
          {tier.note && <p className="mt-3 text-xs text-muted">{tier.note}</p>}
        </div>
      ))}
    </div>
  );
}
