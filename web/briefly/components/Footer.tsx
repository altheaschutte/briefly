import Link from "next/link";

const legalLinks = [
  { href: "/legal/privacy-policy", label: "Privacy Policy" },
  { href: "/legal/terms-of-service", label: "Terms of Service" },
  { href: "/legal/subscription-billing-terms", label: "Subscription & Billing Terms" },
  { href: "/legal/accuracy-disclaimer", label: "Accuracy Disclaimer" }
];

export default function Footer() {
  return (
    <footer className="border-t border-[#93c8c226] bg-[#0f1d2c]/70 backdrop-blur">
      <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Need help?</p>
          <p className="text-sm text-muted">
            Email{" "}
            <a className="text-accent underline underline-offset-4" href="mailto:support@brieflypodcast.app">
              support@brieflypodcast.app
            </a>{" "}
            for support or feedback.
          </p>
          <p className="text-xs text-muted">© 2025 Briefly Collective Pty Ltd.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-transparent px-3 py-2 transition hover:border-[#93c8c226] hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
