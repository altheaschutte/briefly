import Link from "next/link";

const footerLinks = [
  { label: "Library", href: "/home" },
  { label: "Create", href: "/create" },
  { label: "Settings", href: "/settings" },
  { label: "Account", href: "/account" }
];

export default function Footer() {
  return (
    <footer className="bg-transparent">
      <div className="container flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Briefly</p>
          <p className="text-lg font-semibold text-white">Listen with your Briefly account on the web.</p>
          <p className="text-sm text-muted">Full app experience: library, creation, settings, and billing.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-muted">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-borderSoft/60 px-4 py-2 transition hover:border-teal hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
