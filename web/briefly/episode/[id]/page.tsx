"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import { useParams, useRouter } from "next/navigation";
import {
  Play,
  Loader2,
  Pause,
  AlertCircle,
  Share2,
  Download,
  ScrollText,
  MessageSquare,
  Flag,
  Trash2,
  MoreVertical,
  RotateCcw,
  RotateCw,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Episode, EpisodeSegment, SegmentDiveDeeperSeed, Topic, EpisodeSource } from "@/lib/types";
import { deleteEpisode, fetchEpisodeById, requestDiveDeeperEpisode } from "@/lib/api";
import { Container } from "@/components/Container";

export default function EpisodeDetailPage() {
  const session = useRequireAuth();
  const accessToken = session?.access_token;
  const router = useRouter();
  const params = useParams();
  const id = params?.id?.toString() ?? "";

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [creatingSeedId, setCreatingSeedId] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!accessToken || !id) return;
      setLoading(true);
      setError(null);
      setActionError(null);
      setStatusMessage(null);
      setCreatingSeedId(null);
      setAudioReady(false);
      setIsPlaying(false);
      setDurationSeconds(0);
      setCurrentSeconds(0);
      setScrubPreview(null);
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  useEffect(() => {
    const url = episode?.audioUrl;
    setAudioReady(false);
    setIsPlaying(false);
    setDurationSeconds(0);
    setCurrentSeconds(0);
    setScrubPreview(null);

    if (!url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      return;
    }

    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleLoaded = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDurationSeconds(duration);
      setAudioReady(true);
      audio.playbackRate = playbackRate;
    };
    const handleDurationChange = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDurationSeconds(duration);
    };
    const handleTimeUpdate = () => setCurrentSeconds(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      const duration = Number.isFinite(audio.duration) ? audio.duration : durationSeconds;
      setCurrentSeconds(duration || 0);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, [episode?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    setStatusMessage(null);
    setCreatingSeedId(null);
  }, [id]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleShare = async () => {
    if (!episode) return;
    setActionError(null);
    try {
      if (navigator.share && (shareUrl || episode.audioUrl)) {
        await navigator.share({
          title: episode.title,
          text: episode.description ?? episode.summary ?? undefined,
          url: shareUrl || episode.audioUrl
        });
      } else if (navigator.clipboard && shareUrl) {
        await navigator.clipboard.writeText(shareUrl);
        alert("Link copied to clipboard");
      } else {
        throw new Error("Sharing is not available in this browser.");
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Could not share episode");
    } finally {
      setMenuOpen(false);
    }
  };

  const handleDownload = () => {
    if (!episode?.audioUrl) {
      setActionError("Audio is not ready to download yet.");
      setMenuOpen(false);
      return;
    }
    setActionError(null);
    const link = document.createElement("a");
    link.href = episode.audioUrl;
    link.download = `${episode.title || "briefly-episode"}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setMenuOpen(false);
  };

  const handleViewScript = () => {
    setActionError(null);
    const target = document.getElementById("episode-script");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMenuOpen(false);
  };

  const handleFeedback = () => {
    setActionError(null);
    window.open("/support", "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  };

  const handleReport = () => {
    setActionError(null);
    const subject = episode?.title ? `Report for "${episode.title}"` : "Report episode";
    window.open(`mailto:support@briefly.fm?subject=${encodeURIComponent(subject)}`, "_blank");
    setMenuOpen(false);
  };

  const togglePlayback = async () => {
    if (!audioRef.current) return;
    setActionError(null);
    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Could not start playback");
    }
  };

  const seekToProgress = (progress: number) => {
    if (!audioRef.current || !durationSeconds) return;
    const clamped = clamp(progress, 0, 1);
    const targetSeconds = clamped * durationSeconds;
    const wasPlaying = isPlaying;
    audioRef.current.currentTime = targetSeconds;
    setCurrentSeconds(targetSeconds);
    setScrubPreview(null);
    if (wasPlaying) {
      audioRef.current.play().catch((err) => setActionError(err?.message ?? "Could not resume playback"));
    }
  };

  const skipSeconds = (delta: number) => {
    if (!audioRef.current) return;
    const knownDuration =
      (Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : audioRef.current.duration) || 0;
    const hasDuration = Number.isFinite(knownDuration) && knownDuration > 0;
    const unclamped = audioRef.current.currentTime + delta;
    const next = hasDuration ? clamp(unclamped, 0, knownDuration) : Math.max(0, unclamped);
    audioRef.current.currentTime = next;
    setCurrentSeconds(next);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(next);
  };

  const handleDiveDeeperRequest = async (seed: SegmentDiveDeeperSeed) => {
    if (!episode) return;
    if (!accessToken) {
      setActionError("Please sign in again to create a deep dive.");
      return;
    }
    setActionError(null);
    setStatusMessage(null);
    setCreatingSeedId(seed.id);
    try {
      await requestDiveDeeperEpisode(accessToken, episode.id, seed.id);
      setStatusMessage("Requested a deep dive. We'll start generating and add it to your feed shortly.");
    } catch (err: any) {
      setActionError(err?.message ?? "Could not start deep dive");
    } finally {
      setCreatingSeedId(null);
    }
  };

  const handleDelete = async () => {
    if (!episode) return;
    if (!accessToken) {
      setActionError("Please sign in again to delete this episode.");
      return;
    }
    if (!confirm("Delete this episode? This cannot be undone.")) return;
    setActionError(null);
    try {
      await deleteEpisode(accessToken, episode.id);
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setActionError(err?.message ?? "Failed to delete episode");
    } finally {
      setMenuOpen(false);
    }
  };

  const hasAudio = Boolean(episode?.audioUrl);
  const hasScript = Boolean(episode?.showNotes || episode?.transcript);

  const date = formatDate(episode?.publishedAt || episode?.createdAt);
  const orderedSegments = orderSegments(episode?.segments);
  const orderedTopics = orderTopics(episode?.topics);
  const orderedDiveDeeperSeeds = orderDiveDeeperSeeds(episode?.diveDeeperSeeds, orderedSegments);
  const scriptTitle = episode?.showNotes ? "Show notes" : episode?.transcript ? "Transcript" : "Notes";
  const playbackProgress =
    durationSeconds > 0 ? clamp(scrubPreview ?? currentSeconds / durationSeconds, 0, 1) : 0;

  return (
    <main className="py-12 lg:py-20">
      <Container>
        <article className="relative max-w-4xl">
          <div className="absolute right-0 top-0" ref={menuRef}>
            <ActionMenu
              open={menuOpen}
              onToggle={() => setMenuOpen((prev) => !prev)}
              onShare={handleShare}
              onDownload={handleDownload}
              onViewScript={handleViewScript}
              onFeedback={handleFeedback}
              onReport={handleReport}
              onDelete={handleDelete}
              hasAudio={hasAudio}
              hasScript={hasScript}
            />
          </div>

          <header className="flex flex-col gap-4 pr-12 sm:pr-16">
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
                <h1 className="mt-1 text-4xl font-semibold text-ink">{episode?.title || "Episode"}</h1>
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
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {actionError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {actionError}
            </div>
          )}

          {statusMessage && (
            <div className="mt-6 rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm text-ink">
              {statusMessage}
            </div>
          )}

          {episode && (
            <div className="mt-10 space-y-10">
              {episode.audioUrl ? (
                <PlaybackSection
                  title={episode.title}
                  isPlaying={isPlaying}
                  isReady={audioReady}
                  currentSeconds={currentSeconds}
                  durationSeconds={durationSeconds}
                  playbackRate={playbackRate}
                  progress={playbackProgress}
                  onToggle={togglePlayback}
                  onSkip={skipSeconds}
                  onScrubChange={(value) => setScrubPreview(value)}
                  onScrubCommit={seekToProgress}
                  onSpeedChange={cycleSpeed}
                />
              ) : (
                <div className="rounded-3xl border border-borderSoft/60 bg-white/80 p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-ink">Playback</h2>
                  <p className="mt-2 text-sm text-muted">Audio will appear here when this episode is ready.</p>
                </div>
              )}

              {orderedDiveDeeperSeeds.length > 0 && (
                <section className="rounded-3xl border border-borderSoft/60 bg-overlay/60 p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tealSoft">Dive deeper</p>
                      <h2 className="text-xl font-semibold text-ink">Follow-up ideas</h2>
                      <p className="text-sm text-muted">Spin up focused episodes from the strongest segments.</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {orderedDiveDeeperSeeds.map((seed) => {
                      const working = creatingSeedId === seed.id;
                      return (
                        <button
                          key={seed.id}
                          type="button"
                          onClick={() => handleDiveDeeperRequest(seed)}
                          disabled={working}
                          className="flex w-full items-start gap-3 rounded-2xl border border-borderSoft/60 bg-white/60 px-4 py-3 text-left transition hover:-translate-y-[1px] hover:border-accent hover:shadow-sm disabled:opacity-60"
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-ink">{seed.title}</p>
                            {seed.angle && <p className="text-sm text-muted">{seed.angle}</p>}
                          </div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            <span>{working ? "Starting..." : "Generate"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section
                id="episode-script"
                className="rounded-3xl border border-borderSoft/60 bg-white/80 p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-ink">{scriptTitle}</h2>
                  {episode.transcript && episode.showNotes && (
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-tealSoft">Script</span>
                  )}
                </div>
                <div className="prose mt-4 max-w-none prose-a:text-accent">
                  {episode.showNotes ? (
                    notesParagraphs(episode.showNotes).map((block, idx) => (
                      <p key={idx} className="leading-relaxed">
                        {block}
                      </p>
                    ))
                  ) : episode.transcript ? (
                    <p className="leading-relaxed whitespace-pre-line">{episode.transcript}</p>
                  ) : (
                    <p className="leading-relaxed text-muted">No notes available for this episode yet.</p>
                  )}
                </div>
              </section>

              {orderedTopics.length > 0 && (
                <section className="rounded-3xl border border-borderSoft/60 bg-white/80 p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-ink">Topics</h2>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-tealSoft">Briefs</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {orderedTopics.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex flex-col gap-2 rounded-2xl border border-borderSoft/70 bg-overlay/60 p-4"
                      >
                        <p className="text-sm font-semibold text-muted">Idea</p>
                        <p className="text-lg font-semibold text-ink">{topic.originalText}</p>
                        {topic.isSeed && (
                          <span className="inline-flex w-fit items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                            Seed topic
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-3xl border border-borderSoft/60 bg-white/80 p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-ink">Segments</h2>
                  {loading && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                </div>
                {orderedSegments.length === 0 ? (
                  <p className="text-sm text-muted">
                    {loading ? "Loading segments..." : "No segments available yet."}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {orderedSegments.map((segment) => (
                      <SegmentCard key={segment.id} segment={segment} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </article>
      </Container>
    </main>
  );
}

function PlaybackSection({
  title,
  isPlaying,
  isReady,
  currentSeconds,
  durationSeconds,
  playbackRate,
  progress,
  onToggle,
  onSkip,
  onScrubChange,
  onScrubCommit,
  onSpeedChange
}: {
  title?: string;
  isPlaying: boolean;
  isReady: boolean;
  currentSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  progress: number;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onScrubChange: (value: number) => void;
  onScrubCommit: (value: number) => void;
  onSpeedChange: () => void;
}) {
  const disabled = !isReady || !Number.isFinite(durationSeconds) || durationSeconds <= 0;
  return (
    <section className="rounded-3xl border border-borderSoft/60 bg-white/80 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tealSoft">Playback</p>
          <h2 className="text-xl font-semibold text-ink">{title || "Episode controls"}</h2>
          <p className="text-sm text-muted">Play, scrub, and skip through the episode.</p>
        </div>
        <button
          type="button"
          onClick={onSpeedChange}
          className="rounded-full border border-borderSoft px-3 py-1 text-sm font-semibold text-ink transition hover:border-accent"
          aria-label="Playback speed"
        >
          {playbackRate}x
        </button>
      </div>

      <div className="mt-4">
        <WaveformScrubber
          progress={disabled ? 0 : progress}
          activeColor="#A2845E"
          inactiveColor="#E2DFDB"
          onScrubChange={onScrubChange}
          onScrubCommit={onScrubCommit}
          disabled={disabled}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>{formatTimecode(currentSeconds)}</span>
          <span>{formatTimecode(durationSeconds)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <SkipControlButton
          icon={RotateCcw}
          label="-15s"
          onClick={() => onSkip(-15)}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-md transition hover:-translate-y-[1px] disabled:opacity-60"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
        </button>
        <SkipControlButton
          icon={RotateCw}
          label="+15s"
          onClick={() => onSkip(15)}
          disabled={disabled}
        />
      </div>

      {!isReady && (
        <p className="mt-3 text-sm text-muted">Preparing audio… We’ll enable controls once it’s ready.</p>
      )}
    </section>
  );
}

function SkipControlButton({
  icon: Icon,
  label,
  onClick,
  disabled
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-full border border-borderSoft/70 bg-overlay/60 px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-60"
      aria-label={label}
    >
      <Icon className="h-5 w-5 text-muted" />
      <span>{label}</span>
    </button>
  );
}

function WaveformScrubber({
  progress,
  activeColor,
  inactiveColor,
  onScrubChange,
  onScrubCommit,
  disabled
}: {
  progress: number;
  activeColor: string;
  inactiveColor: string;
  onScrubChange: (value: number) => void;
  onScrubCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const bars = [
    22, 32, 18, 40, 28, 36, 24, 30, 18, 38, 24, 34, 28, 40, 22, 36, 20, 32, 26, 34, 18, 30, 22, 36, 20, 28, 38, 24,
    34, 26, 22, 36, 28, 32, 20, 30, 24, 34, 18, 28, 22, 36, 20, 32, 26, 34, 18, 30
  ];
  const barWidth = 5;
  const gap = 3;
  const height = 48;
  const width = bars.length * (barWidth + gap) - gap;
  const clampedProgress = clamp(progress, 0, 1);
  const activeCount = clampedProgress * bars.length;

  const updateProgress = (clientX: number) => {
    if (!svgRef.current) return progress;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const value = clamp(ratio, 0, 1);
    onScrubChange(value);
    return value;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    setIsPointerDown(true);
    updateProgress(event.clientX);
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!isPointerDown || disabled) return;
    updateProgress(event.clientX);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    if (isPointerDown) {
      const value = updateProgress(event.clientX);
      onScrubCommit(clamp(value, 0, 1));
    }
    setIsPointerDown(false);
    svgRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={clsx("rounded-2xl bg-overlay/60 p-3", disabled && "opacity-70")}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full cursor-pointer select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {bars.map((h, index) => {
          const x = index * (barWidth + gap);
          const y = (height - h) / 2;
          const isActive = index <= activeCount;
          return (
            <rect
              key={`${index}-${h}`}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={2}
              fill={isActive ? activeColor : inactiveColor}
            />
          );
        })}
      </svg>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "Recent episode";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent episode";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function orderTopics(topics?: Topic[]) {
  if (!Array.isArray(topics)) return [] as Topic[];
  return [...topics].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

function orderSegments(segments?: EpisodeSegment[]) {
  if (!Array.isArray(segments)) return [] as EpisodeSegment[];
  return [...segments].sort((a, b) => {
    const left = a.orderIndex ?? a.order_index ?? 0;
    const right = b.orderIndex ?? b.order_index ?? 0;
    return left - right;
  });
}

function orderDiveDeeperSeeds(
  seeds?: SegmentDiveDeeperSeed[],
  segments?: EpisodeSegment[]
): SegmentDiveDeeperSeed[] {
  if (!Array.isArray(seeds) || seeds.length === 0) return [];
  const segmentOrder = new Map<string, number>();
  (segments ?? []).forEach((segment, index) => {
    if (segment.id) segmentOrder.set(segment.id, index);
  });

  const withSegment = seeds.filter((seed) => seed.segmentId && segmentOrder.has(seed.segmentId));
  const withoutSegment = seeds.filter((seed) => !seed.segmentId || !segmentOrder.has(seed.segmentId));

  withSegment.sort((a, b) => {
    const left = a.segmentId ? segmentOrder.get(a.segmentId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const right = b.segmentId ? segmentOrder.get(b.segmentId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
  });

  withoutSegment.sort((a, b) => {
    const left = a.position ?? Number.MAX_SAFE_INTEGER;
    const right = b.position ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.title.localeCompare(b.title);
  });

  return [...withSegment, ...withoutSegment];
}

function notesParagraphs(notes: string) {
  return notes
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max?: number) {
  const upper = max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(value, min), upper);
}

function formatTimecode(seconds?: number) {
  if (seconds === undefined || Number.isFinite(seconds) === false) return "";
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    const remMins = mins % 60;
    return `${hours}:${remMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(seconds?: number) {
  if (seconds === undefined || Number.isFinite(seconds) === false) return "";
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins}m`;
}

function sourceHost(url?: string) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function SourcesList({ sources }: { sources: EpisodeSource[] }) {
  if (!sources || sources.length === 0) {
    return <p className="mt-3 text-xs text-muted">Sources will appear here when available.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {sources.map((source) => {
        const host = sourceHost(source.url);
        const label = source.sourceTitle ?? source.source_title ?? host ?? "Source";
        return (
          <div key={source.id} className="flex items-start gap-2 text-sm">
            <span className="mt-[6px] h-2 w-2 rounded-full bg-accent" />
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-ink transition hover:text-accent"
              >
                {label}
                {host && <span className="text-muted"> — {host}</span>}
              </a>
            ) : (
              <span className="text-ink">
                {label}
                {host && <span className="text-muted"> — {host}</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SegmentCard({ segment }: { segment: EpisodeSegment }) {
  const duration = segment.durationSeconds ?? segment.duration_seconds;
  const start = segment.startTimeSeconds ?? segment.start_time_seconds;
  const sources = segment.sources ?? segment.rawSources ?? segment.raw_sources ?? [];
  const body = segment.script ?? segment.rawContent ?? segment.raw_content;
  const title = segment.title || `Segment ${segment.orderIndex ?? segment.order_index ?? ""}`;

  return (
    <div className="rounded-2xl border border-borderSoft/70 bg-overlay/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {start !== undefined && start !== null && (
              <span className="rounded-full bg-white/70 px-3 py-1 font-semibold text-ink">{formatTimecode(start)}</span>
            )}
            {duration !== undefined && duration !== null && (
              <span className="rounded-full bg-white/70 px-3 py-1 font-semibold text-ink">
                {formatDuration(duration)}
              </span>
            )}
          </div>
          <p className="text-lg font-semibold text-ink">{title}</p>
          {body && <p className="text-sm leading-relaxed text-muted max-h-24 overflow-hidden">{body}</p>}
        </div>
      </div>
      <SourcesList sources={sources} />
    </div>
  );
}

function ActionMenu({
  open,
  onToggle,
  onShare,
  onDownload,
  onViewScript,
  onFeedback,
  onReport,
  onDelete,
  hasAudio,
  hasScript
}: {
  open: boolean;
  onToggle: () => void;
  onShare: () => void;
  onDownload: () => void;
  onViewScript: () => void;
  onFeedback: () => void;
  onReport: () => void;
  onDelete: () => void;
  hasAudio: boolean;
  hasScript: boolean;
}) {
  const ActionButton = ({
    icon: Icon,
    label,
    onClick,
    danger,
    disabled
  }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
        danger ? "text-red-700 hover:bg-red-50" : "text-ink hover:bg-overlay/60"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <Icon className={`h-4 w-4 ${danger ? "text-red-700" : "text-muted"}`} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-borderSoft/70 bg-overlay/70 text-ink transition hover:border-accent"
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-borderSoft/70 bg-overlay/90 p-2 shadow-xl backdrop-blur">
          <ActionButton icon={Share2} label="Share episode" onClick={onShare} />
          <ActionButton icon={Download} label="Download" onClick={onDownload} disabled={!hasAudio} />
          <ActionButton icon={ScrollText} label="View script" onClick={onViewScript} disabled={!hasScript} />
          <ActionButton icon={MessageSquare} label="Feedback" onClick={onFeedback} />
          <ActionButton icon={Flag} label="Report" onClick={onReport} />
          <div className="my-1 border-t border-borderSoft/60" />
          <ActionButton icon={Trash2} label="Delete" onClick={onDelete} danger />
        </div>
      )}
    </div>
  );
}
