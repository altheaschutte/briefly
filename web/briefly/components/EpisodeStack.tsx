import { Episode } from "@/lib/types";
import { Play, Loader, AlertTriangle, Clock } from "lucide-react";
import clsx from "clsx";
import { isEpisodeReady } from "@/lib/api";

const statusStyles: Record<string, string> = {
  ready: "bg-accent text-ink",
  queued: "bg-overlay text-tealSoft border border-borderSoft",
  generating: "bg-overlay text-accent border border-borderSoft",
  failed: "bg-red-50 text-red-700 border border-red-200"
};

const statusLabel: Record<string, string> = {
  ready: "Ready",
  queued: "Queued",
  generating: "Generating",
  failed: "Failed"
};

type Props = {
  episodes: Episode[];
  loading?: boolean;
  onGenerate?: () => void;
  showHeader?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export default function EpisodeStack({
  episodes,
  loading,
  onGenerate,
  showHeader = true,
  error,
  onRetry
}: Props) {
  const readyEpisodes = episodes.filter((e) => isEpisodeReady(e));

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Episodes</p>
            <h2 className="text-2xl font-semibold text-ink">Your Briefly feed</h2>
          </div>
          {onGenerate && (
            <button
              className="hidden items-center gap-2 rounded-full border border-borderSoft bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent md:inline-flex"
              onClick={onGenerate}
            >
              <Clock className="h-4 w-4" />
              Generate
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="glass-panel p-4 text-sm text-muted">
          <Loader className="mr-2 inline-block h-4 w-4 animate-spin text-accent" />
          Loading your episodes...
        </div>
      )}

      {error && (
        <div className="glass-panel flex items-center justify-between bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          {onRetry && (
            <button
              className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {readyEpisodes.map((episode) => (
          <div
            key={episode.id}
            className="card-accent relative overflow-hidden p-5 transition hover:-translate-y-1 hover:shadow-accent"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-overlay text-ink shadow-inner">
                <Play className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">
                      {episode.publishedAt || episode.createdAt || "Recent"}
                    </p>
                    <h3 className="text-lg font-semibold text-ink">{episode.title}</h3>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      statusStyles[(episode.status || "").toLowerCase()] ?? "bg-overlay text-muted"
                    )}
                  >
                    {statusLabel[(episode.status || "").toLowerCase()] ?? episode.status ?? "Ready"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{episode.description || episode.summary}</p>
              </div>
            </div>

            {episode.segments && episode.segments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                {episode.segments.slice(0, 4).map((segment) => (
                  <span
                    key={segment.id || segment.title}
                    className="rounded-full border border-borderSoft/70 bg-overlay/60 px-3 py-1 text-ink/80"
                  >
                    {segment.title || "Segment"}{" "}
                    {(() => {
                      const duration = segment.durationSeconds ?? segment.duration_seconds;
                      return duration ? `· ${formatMinutes(duration)}` : "";
                    })()}
                  </span>
                ))}
              </div>
            )}

            {episode.status && episode.status.toLowerCase() === "generating" && (
              <div className="mt-4 flex items-center gap-2 text-sm text-accent">
                <Loader className="h-4 w-4 animate-spin" />
                Rendering audio — hang tight
              </div>
            )}
            {episode.status && episode.status.toLowerCase() === "queued" && (
              <div className="mt-4 text-xs text-muted">We will alert you as soon as this episode is ready.</div>
            )}
            {episode.status && episode.status.toLowerCase() === "failed" && (
              <div className="mt-4 flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Something went wrong. Retry from the queue.
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && readyEpisodes.length === 0 && !error && (
        <div className="glass-panel p-4 text-sm text-muted">
          No ready episodes yet. Generate one to see it here.
        </div>
      )}
    </div>
  );
}

function formatMinutes(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const minutes = Math.max(Math.round(seconds / 60), 1);
  return `${minutes}m`;
}
