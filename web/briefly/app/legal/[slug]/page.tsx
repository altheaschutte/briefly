import fs from "fs/promises";
import path from "path";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

type LegalSlug =
  | "privacy-policy"
  | "terms-of-service"
  | "subscription-billing-terms"
  | "accuracy-disclaimer";

const LEGAL_PAGES: Record<
  LegalSlug,
  {
    title: string;
    description: string;
    filename: string;
  }
> = {
  "privacy-policy": {
    title: "Privacy Policy",
    description: "How Briefly handles your data and protects your privacy.",
    filename: "privacy-policy.md"
  },
  "terms-of-service": {
    title: "Terms of Service",
    description: "The rules for using Briefly across web and mobile apps.",
    filename: "terms-of-service.md"
  },
  "subscription-billing-terms": {
    title: "Subscription & Billing Terms",
    description: "Details on plans, renewals, cancellations, and refunds.",
    filename: "subscription-billing-terms.md"
  },
  "accuracy-disclaimer": {
    title: "Accuracy Disclaimer",
    description: "What to expect from AI-generated summaries and transcripts.",
    filename: "accuracy-disclaimer.md"
  }
};

const legalSlugs = Object.keys(LEGAL_PAGES) as LegalSlug[];

function isLegalSlug(slug: string): slug is LegalSlug {
  return legalSlugs.includes(slug as LegalSlug);
}

async function loadMarkdown(filename: string) {
  const filePath = path.join(process.cwd(), "content", "legal", filename);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    console.warn(`Legal markdown not found at ${filePath}. Showing placeholder.`);
    return null;
  }
}

export function generateStaticParams() {
  return legalSlugs.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const page = LEGAL_PAGES[slug];
  return {
    title: `${page.title} | Briefly`,
    description: page.description
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const page = LEGAL_PAGES[slug];

  const markdown = await loadMarkdown(page.filename);
  const fallback = `# ${page.title}\n\nContent coming soon. If you need assistance, contact support@brieflypodcast.app.`;

  return (
    <div className="container relative max-w-4xl py-12 md:py-16">
      <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-accent/5 via-overlay/40 to-[#0b1926] blur-3xl" />
      <div className="overflow-hidden rounded-[28px] border border-[#93c8c226] bg-[#0f1f30]/70 shadow-2xl backdrop-blur">
        <div className="border-b border-[#93c8c226] bg-[#13293d]/60 px-6 py-6 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tealSoft">Briefly Legal</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{page.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">{page.description}</p>
          <p className="mt-3 text-sm text-accent">
            Need help? Email{" "}
            <a className="underline" href="mailto:support@brieflypodcast.app">
              support@brieflypodcast.app
            </a>
            .
          </p>
        </div>
        <article className="prose prose-invert prose-headings:text-white prose-a:text-accent prose-strong:text-white prose-blockquote:border-accent/40 prose-blockquote:text-muted max-w-none px-6 py-8 md:px-8 md:py-10">
          <ReactMarkdown>{markdown ?? fallback}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
