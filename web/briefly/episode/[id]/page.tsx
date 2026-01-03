"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Play,
  Loader2,
  AlertCircle,
  Share2,
  Download,
  ScrollText,
  MessageSquare,
  Flag,
  Trash2,
  MoreVertical,
  type LucideIcon
} from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Episode } from "@/lib/types";
import { deleteEpisode, fetchEpisodeById } from "@/lib/api";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!accessToken || !id) return;
      setLoading(true);
      setError(null);
      setActionError(null);
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

          {episode && (
            <div
              id="episode-script"
              className="prose mt-10 max-w-none prose-a:text-accent"
            >
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
