"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Episode } from "@/lib/types";
import { fetchEpisodes, isEpisodeReady } from "@/lib/api";
import { Container } from "@/components/Container";

export default function HomePage() {
  const token = useRequireAuth();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const eps = await fetchEpisodes(token.access_token);
        setEpisodes(eps.filter((ep) => isEpisodeReady(ep)));
      } catch (err: any) {
        setError(err?.message ?? "Failed to load episodes");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const sorted = useMemo(
    () =>
      episodes.sort((a, b) => {
        const aDate = new Date(a.publishedAt || a.createdAt || "").getTime();
        const bDate = new Date(b.publishedAt || b.createdAt || "").getTime();
        return (bDate || 0) - (aDate || 0);
      }),
    [episodes]
  );

  return (
    <main className="py-12 lg:py-16">
      <Container>
        <h1 className="text-2xl font-semibold text-white">Episodes</h1>
      </Container>
      <div className="divide-y divide-borderSoft/30 sm:mt-4 lg:mt-8 lg:border-t lg:border-borderSoft/30">
        {sorted.map((episode) => (
          <EpisodeEntry key={episode.id} episode={episode} />
        ))}
      </div>
      {loading && (
        <Container>
          <div className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Loading episodes...
          </div>
        </Container>
      )}
      {error && (
        <Container>
          <div className="mt-6 flex items-center gap-2 text-sm text-red-200">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </Container>
      )}
      {!loading && sorted.length === 0 && (
        <Container>
          <p className="mt-6 text-sm text-muted">No episodes yet. Generate one to see it here.</p>
        </Container>
      )}
    </main>
  );
}

function EpisodeEntry({ episode }: { episode: Episode }) {
  const date = formatDate(episode.publishedAt || episode.createdAt);

  return (
    <article aria-labelledby={`episode-${episode.id}-title`} className="py-8 sm:py-10">
      <Container>
        <div className="flex flex-col items-start gap-2">
          <h2 id={`episode-${episode.id}-title`} className="mt-1 text-lg font-semibold text-white">
            <Link href={`/episode/${episode.id}`}>{episode.title}</Link>
          </h2>
          <p className="order-first font-mono text-xs uppercase tracking-[0.2em] text-tealSoft">{date}</p>
          <p className="text-base text-muted">{episode.description || episode.summary}</p>
          <div className="mt-4 flex items-center gap-4 text-sm font-semibold">
            <ListenButton episode={episode} />
            <span aria-hidden="true" className="text-sm font-bold text-borderSoft/80">
              /
            </span>
            <Link
              href={`/episode/${episode.id}`}
              className="flex items-center text-sm font-semibold text-accent hover:opacity-90"
              aria-label={`Show notes for episode ${episode.title}`}
            >
              Show notes
            </Link>
          </div>
        </div>
      </Container>
    </article>
  );
}

function ListenButton({ episode }: { episode: Episode }) {
  const href = episode.audioUrl ? episode.audioUrl : `/episode/${episode.id}`;
  const target = episode.audioUrl ? "_blank" : undefined;
  return (
    <Link
      href={href}
      target={target}
      className="flex items-center gap-2 text-sm font-semibold text-accent hover:opacity-90"
      aria-label={`Listen to ${episode.title}`}
    >
      <Play className="h-3 w-3 fill-current" />
      <span aria-hidden="true">Listen</span>
    </Link>
  );
}

function formatDate(value?: string) {
  if (!value) return "Recent episode";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent episode";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
