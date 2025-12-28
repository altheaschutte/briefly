"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Briefcase, GraduationCap, Loader2, Newspaper, Rocket, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getProfile, upsertProfile } from "@/lib/profile";

const intentionOptions = [
  {
    title: "Stay informed",
    description: "Get clear, audio summaries of the most important news without endless scrolling or noise.",
    Icon: Newspaper
  },
  {
    title: "Learn & understand",
    description: "Turn complex topics into easy-to-follow, podcast-style explanations you can actually absorb.",
    Icon: GraduationCap
  },
  {
    title: "Professional growth",
    description: "Stay sharp with insights and updates that help you think better at work and in your industry.",
    Icon: Briefcase
  },
  {
    title: "Discover new ideas",
    description: "Explore topics you would not normally search for and stumble into interesting ideas effortlessly.",
    Icon: Rocket
  },
  {
    title: "Something else",
    description: "Tell us what you want to hear and we will tailor Briefly around it.",
    Icon: Sparkles
  }
] as const;

type IntentionTitle = (typeof intentionOptions)[number]["title"];

export default function OnboardingPage() {
  const { session, isReady } = useAuth();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [firstName, setFirstName] = useState("");
  const [intentions, setIntentions] = useState<IntentionTitle[]>([]);
  const [otherIntention, setOtherIntention] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const checkProfile = async () => {
      try {
        const profile = await getProfile(supabase, session.user.id);
        if (profile) {
          router.replace("/");
          return;
        }
      } catch (err) {
        console.error("Failed to load profile during onboarding", err);
      } finally {
        setLoading(false);
      }
    };
    checkProfile();
  }, [isReady, session, router, supabase]);

  useEffect(() => {
    if (!isReady || !session || firstName) return;
    const googleFirstName =
      typeof session.user.user_metadata?.given_name === "string"
        ? session.user.user_metadata.given_name
        : typeof session.user.user_metadata?.full_name === "string"
          ? session.user.user_metadata.full_name
          : typeof session.user.user_metadata?.name === "string"
            ? session.user.user_metadata.name
            : "";
    if (googleFirstName) {
      setFirstName(googleFirstName.split(" ")[0]);
    }
  }, [isReady, session, firstName]);

  const toggleIntention = (title: IntentionTitle) => {
    setIntentions((prev) => {
      if (prev.includes(title)) {
        if (title === "Something else") {
          setOtherIntention("");
        }
        return prev.filter((item) => item !== title);
      }
      return [...prev, title];
    });
  };

  const resolvedIntentions = useMemo(() => {
    return intentions.map((title) => {
      if (title === "Something else") {
        const trimmed = otherIntention.trim();
        return trimmed || title;
      }
      return title;
    });
  }, [intentions, otherIntention]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (!firstName.trim() || resolvedIntentions.length === 0) {
      setError("First name and at least one intention are required.");
      return;
    }
    if (intentions.includes("Something else") && !otherIntention.trim()) {
      setError("Tell us more about your intention.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await upsertProfile(supabase, {
        id: session.user.id,
        first_name: firstName.trim(),
        intention: resolvedIntentions.join(", ")
      });
      router.replace("/");
    } catch (err: any) {
      setError(err?.message ?? "Could not save your profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container flex min-h-[100dvh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Preparing onboarding...
        </div>
      </div>
    );
  }

  return (
    <div className="container flex min-h-[100dvh] flex-col items-center justify-start">
      <div className="md:mt-16 w-full max-w-2xl space-y-6 rounded-xl bg-white/5 p-8 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3 text-white">
          <Sparkles className="h-5 w-5 text-accent" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Onboarding</p>
            <h1 className="text-3xl font-semibold text-white">Tell us about you</h1>
            {/* <p className="text-sm text-muted">We use this to personalise your initial topics only.</p> */}
          </div>
        </div>

        <form className="space-y-8  text-muted" onSubmit={handleSubmit}>
          <label className="block space-y-1 ">
            <span className="mb-2 text-sm">First name</span>
            <input
              className="w-full rounded-lg border border-transparent bg-overlay px-3 py-2 text-white outline-none focus:border-teal focus:ring-1 focus:ring-tealSoft"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm text-muted">What are you here for? Select all that apply.</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {intentionOptions.map(({ title, description, Icon }) => {
                const selected = intentions.includes(title);
                return (
                  <button
                    key={title}
                    type="button"
                    aria-pressed={selected}
                    className={`flex h-full flex-col gap-3 rounded-lg border px-4 py-3 text-left transition ${
                      selected
                        ? "border-tealSoft/70 bg-tealSoft/10 text-white"
                        : "border-white/10 bg-overlay text-muted hover:border-tealSoft/40 hover:bg-tealSoft/10"
                    }`}
                    onClick={() => toggleIntention(title)}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                          selected ? "border-tealSoft bg-tealSoft/20 text-white" : "border-white/10 bg-white/5"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-white">{title}</p>
                        <p className="text-sm text-muted">{description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {intentions.includes("Something else") && (
              <label className="block space-y-1">
                <span className="mb-2 text-sm">Tell us more</span>
                <input
                  className="w-full rounded-lg border border-transparent bg-overlay px-3 py-2 text-white outline-none focus:border-teal focus:ring-1 focus:ring-tealSoft"
                  value={otherIntention}
                  onChange={(e) => setOtherIntention(e.target.value)}
                  required
                />
              </label>
            )}
          </fieldset>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-ink shadow-overlay transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-70"
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save and continue
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
