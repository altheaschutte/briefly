"use client";

import { useRef, useState, type TouchEvent } from "react";
import { Topic } from "@/lib/types";
import { GripVertical, PlayCircle, PauseCircle, Trash2 } from "lucide-react";
import clsx from "clsx";

const SWIPE_THRESHOLD = 28;

type Props = {
  topics: Topic[];
  loading?: boolean;
  maxActive?: number;
  onToggle?: (topic: Topic) => void;
  onDelete?: (topic: Topic) => void;
};

export default function TopicBoard({ topics, loading, maxActive, onToggle, onDelete }: Props) {
  const activeCount = topics.filter((t) => t.isActive).length;
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (id: string, e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    if (revealedId && revealedId !== id) {
      setRevealedId(null);
    }
  };

  const handleTouchMove = (id: string, e: TouchEvent) => {
    const startX = touchStartX.current;
    if (startX === null) return;
    const deltaX = e.touches[0].clientX - startX;

    if (deltaX < -SWIPE_THRESHOLD) {
      setRevealedId(id);
    }
    if (deltaX > SWIPE_THRESHOLD && revealedId === id) {
      setRevealedId(null);
    }
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Topics</p>
          <h3 className="text-xl font-semibold text-ink">Active lineup</h3>
        </div>
        {maxActive !== undefined && (
          <span className="rounded-full border border-borderSoft/70 px-3 py-1 text-xs text-muted">
            {activeCount}/{maxActive} active
          </span>
        )}
      </div>

      {loading && <p className="mt-3 text-sm text-muted">Loading topics...</p>}

      <div className="mt-4 space-y-3">
        {topics.map((topic, idx) => (
          <div
            key={topic.id}
            className={clsx(
              "relative overflow-hidden rounded-2xl border border-borderSoft/70 bg-overlay/80",
              topic.isActive ? "shadow-glow" : "opacity-80"
            )}
          >
            <div
              className={clsx(
                "flex items-center gap-3 px-3 py-3 text-sm text-ink transition-transform duration-200",
                revealedId === topic.id ? "-translate-x-16" : "translate-x-0"
              )}
              onTouchStart={(e) => handleTouchStart(topic.id, e)}
              onTouchMove={(e) => handleTouchMove(topic.id, e)}
              onTouchEnd={handleTouchEnd}
            >
              <GripVertical className="h-4 w-4 text-muted" />
              <div className="flex-1">
                <p className="font-semibold">{topic.originalText}</p>
                <p className="text-[11px] text-muted">Position {topic.orderIndex + 1}</p>
              </div>
              {onToggle && (
                <button
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition",
                    topic.isActive
                      ? "bg-accent text-ink shadow-accent"
                      : "border border-borderSoft/70 bg-white text-muted hover:border-accent"
                  )}
                  onClick={() => onToggle(topic)}
                >
                  {topic.isActive ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                  {topic.isActive ? "Active" : "Paused"}
                </button>
              )}
              {onDelete && (
                <button
                  className="hidden rounded-full border border-borderSoft/70 p-2 text-muted transition hover:border-red-300 hover:text-red-200 sm:inline-flex"
                  onClick={() => onDelete(topic)}
                  aria-label="Delete topic"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <span className="rounded-full bg-overlay px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
                {idx + 1}
              </span>
            </div>
            {onDelete && (
              <button
                className={clsx(
                  "absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg transition sm:hidden",
                  revealedId === topic.id ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-10 opacity-0"
                )}
                onClick={() => onDelete(topic)}
                aria-label="Delete topic"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="rounded-full border border-borderSoft/60 px-3 py-1">Reorder in app</span>
        <span className="rounded-full border border-borderSoft/60 px-3 py-1">Toggle active</span>
        <span className="rounded-full border border-borderSoft/60 px-3 py-1">Limit keeps focus</span>
      </div>
    </div>
  );
}
