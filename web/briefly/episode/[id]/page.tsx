"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Episode } from "@/lib/types";
import { fetchEpisodeById } from "@/lib/api";
import { Container } from "@/components/Container";

export default function EpisodeDetailPage() {
  const session = useRequireAuth();
  const accessToken = session?.access_token;
  const params = useParams();
  const id = params?.id?.toString() ?? "";

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!accessToken || !id) return;
      setLoading(true);
      setError(null);
      try {
        const ep = await fetchEpisodeById(accessToken, id);
        setEpisode(ep);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load episode");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessToken, id]);

  const date = formatDate(episode?.publishedAt || episode?.createdAt);

  return (
    <main className="py-12 lg:py-20">
      <Container>
        <article className="max-w-4xl">
          <header className="flex flex-col gap-4">
            <div className="flex items-center gap-6">
              <a
                className="group relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent text-ink transition hover:opacity-90"
                href={episode?.audioUrl || "#"}
                target={episode?.audioUrl ? "_blank" : undefined}
                rel={episode?.audioUrl ? "noopener noreferrer" : undefined}
              >
                <Play className="h-8 w-8" />
              </a>
              <div className="flex flex-col">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-tealSoft">{date}</p>
                <h1 className="mt-1 text-4xl font-semibold text-white">{episode?.title || "Episode"}</h1>
              </div>
            </div>
            {episode && (
              <p className="text-lg font-medium text-muted">{episode.description || episode.summary}</p>
            )}
          </header>

          <hr className="my-10 border-borderSoft/30" />

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Loading episode...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-200">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {episode && (
            <div className="prose mt-10 max-w-none text-muted prose-headings:text-white prose-p:text-muted prose-strong:text-white prose-a:text-accent prose-li:text-muted">
              {episode.showNotes ? (
                episode.showNotes.split("\n\n").map((block, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {block}
                  </p>
                ))
              ) : episode.transcript ? (
                <p className="leading-relaxed whitespace-pre-line">{episode.transcript}</p>
              ) : (
                <p className="leading-relaxed">No notes available for this episode yet.</p>
              )}
            </div>
          )}
        </article>
      </Container>
    </main>
  );
}

function formatDate(value?: string) {
  if (!value) return "Recent episode";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent episode";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
