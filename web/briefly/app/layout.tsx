import type { Metadata } from "next";
import "./globals.css";
import { Space_Grotesk, Manrope } from "next/font/google";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/context/AuthContext";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Briefly Web App",
  description:
    "Sign in with your Briefly account to access library, create/topics, settings, and Stripe-powered billing on the web."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} bg-midnight text-muted`}>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Navigation />
            <main className="flex-1 pb-20 pt-8 md:pt-12">{children}</main>
            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
