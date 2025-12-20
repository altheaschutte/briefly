"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, X, Headphones, LogOut, LogIn } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";

const links = [
  { href: "/home", label: "Library" },
  { href: "/create", label: "Create" },
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" }
];

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { token, email, logout } = useAuth();

  const linkClasses = (href: string) =>
    clsx(
      "rounded-full px-4 py-2 text-sm font-semibold transition",
      pathname === href ? "text-white" : "text-muted hover:text-white"
    );

  return (
    <header className="sticky top-0 z-30 bg-transparent">
      <div className="container flex items-center justify-between py-4">
        <Link href="/home" className="flex items-center gap-3 text-white">
          <Image
            src="/briefly-logo.png"
            alt="Briefly"
            width={40}
            height={40}
            className="rounded-xl"
          />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Briefly</p>
            <p className="text-base font-semibold leading-none">Web app</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {token &&
            links.map((link) => (
              <Link key={link.href} href={link.href} className={linkClasses(link.href)}>
                {link.label}
              </Link>
            ))}
          {token ? (
            <>
              <Link
                href="/home"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                <Headphones className="h-4 w-4" />
                Open player
              </Link>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />
              Login
            </button>
          )}
        </nav>

        <button className="inline-flex items-center rounded-full bg-transparent p-2 text-white md:hidden" onClick={() => setOpen((prev) => !prev)} aria-label="Toggle navigation">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="px-6 pb-6 pt-2 md:hidden">
          <div className="flex flex-col gap-2">
            {token &&
              links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClasses(link.href)}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            {token ? (
              <>
                <Link
                  href="/home"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
                  onClick={() => setOpen(false)}
                >
                  <Headphones className="h-4 w-4" />
                  Open player
                </Link>
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
                  router.push("/");
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
