"use client";

import { useEffect, useState } from "react";
import TopicBoard from "@/components/TopicBoard";
import { Topic, Entitlements } from "@/lib/types";
import { createTopic, fetchTopics, fetchEntitlements, updateTopic, deleteTopic, requestEpisodeGeneration } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Mic, Sparkles, Plus, CheckCircle, Target, ArrowRight, Loader2, AlertCircle } from "lucide-react";

const suggested = ["AI + startups", "Climate & energy", "Global headlines", "Local arts", "Longform essays"];

export default function CreatePage() {
  const session = useRequireAuth();
  const accessToken = session?.access_token;
  const [topics, setTopics] = useState<Topic[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTopic, setNewTopic] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const [fetched, ents] = await Promise.all([
          fetchTopics(accessToken),
          fetchEntitlements(accessToken)
        ]);
        setTopics(fetched.sort((a, b) => a.orderIndex - b.orderIndex));
        setEntitlements(ents);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load topics");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accessToken]);

  const addTopic = async (text: string) => {
    if (!accessToken || !text.trim()) return;
    setSaving(true);
    try {
      const created = await createTopic(accessToken, text.trim());
      setTopics((prev) => [...prev, created].sort((a, b) => a.orderIndex - b.orderIndex));
      setNewTopic("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to add topic");
    } finally {
      setSaving(false);
    }
  };

  const toggleTopic = async (topic: Topic) => {
    if (!accessToken) return;
    setSaving(true);
    try {
      const updated = await updateTopic(accessToken, { ...topic, isActive: !topic.isActive });
      setTopics((prev) =>
        prev
          .map((t) => (t.id === updated.id ? updated : t))
          .sort((a, b) => a.orderIndex - b.orderIndex)
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to update topic");
    } finally {
      setSaving(false);
    }
  };

  const removeTopic = async (topic: Topic) => {
    if (!accessToken) return;
    if (!confirm(`Delete "${topic.originalText}"?`)) return;
    setSaving(true);
    try {
      await deleteTopic(accessToken, topic.id);
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete topic");
    } finally {
      setSaving(false);
    }
  };

  const queueEpisode = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      await requestEpisodeGeneration(accessToken);
      alert("Episode generation requested. Check your library for status.");
    } catch (err: any) {
      setError(err?.message ?? "Could not queue episode");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container space-y-12">
      <header className="glass-panel p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Create</p>
            <h1 className="text-3xl font-semibold text-white">Set up topics and generate a Brief</h1>
            <p className="text-sm text-muted">
              Same flow as iOS: speak or type topics, keep up to five active, and trigger a new episode when you are ready.
            </p>
          </div>
          <div className="rounded-full border border-borderSoft/70 px-4 py-2 text-xs text-muted">
            Stripe billing unlocks daily generation + longer mixes
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-accent" />
              <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Voice onboarding</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              Hold to record just like on the phone. We stream transcripts and extract topics live.
            </p>
            <div className="mt-4 rounded-2xl border border-borderSoft/70 bg-surface/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Transcript</p>
              <p className="text-sm text-white">"Find art exhibitions on the Sunshine Coast and daily AI launch news."</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-full border border-borderSoft/60 px-3 py-1">Streaming...</span>
                <span className="rounded-full border border-borderSoft/60 px-3 py-1">Topic extraction</span>
                <span className="rounded-full border border-borderSoft/60 px-3 py-1">Ready to save</span>
              </div>
            </div>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-70"
              onClick={queueEpisode}
              disabled={saving}
            >
              Save topics and generate
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Manual entry</p>
                <p className="text-sm text-muted">Type and reorder before generating.</p>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-borderSoft px-3 py-2 text-xs text-white transition hover:border-teal disabled:opacity-60"
                onClick={() => addTopic(newTopic || "New topic")}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                Add topic
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <label className="block space-y-1 text-sm text-muted">
                Topic text
                <div className="flex items-center gap-2 rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">
                  <input
                    className="w-full bg-transparent text-white outline-none"
                    placeholder="e.g. Climate tech breakthroughs"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-ink shadow-accent transition hover:-translate-y-0.5 disabled:opacity-70"
                    onClick={() => addTopic(newTopic)}
                    disabled={saving || newTopic.trim().length === 0}
                  >
                    Add
                  </button>
                </div>
              </label>
              {topics.slice(0, 5).map((topic) => (
                <div key={topic.id} className="flex items-center justify-between rounded-2xl border border-borderSoft/70 bg-overlay/70 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{topic.originalText}</p>
                    <p className="text-xs text-muted">Position {topic.orderIndex + 1}</p>
                  </div>
                  <CheckCircle className="h-4 w-4 text-teal" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
              {suggested.map((tag) => (
                <button
                  key={tag}
                  className="rounded-full border border-borderSoft/60 px-3 py-1 transition hover:border-teal"
                  onClick={() => addTopic(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1fr,1.05fr]">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Active topics</p>
          <TopicBoard
            topics={topics}
            loading={loading}
            maxActive={entitlements?.limits?.maxActiveTopics ?? 5}
            onToggle={toggleTopic}
            onDelete={removeTopic}
          />
        </div>
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <p className="text-sm uppercase tracking-[0.2em] text-tealSoft">Generation target</p>
          </div>
          <p className="mt-2 text-sm text-muted">
            Pick your duration and CTA before creating the episode. Matches the iOS "create" screen.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Duration</p>
              <p className="text-lg font-semibold text-white">10 minutes</p>
              <p className="text-xs text-muted">Great for a commute</p>
            </div>
            <div className="rounded-2xl border border-borderSoft/70 bg-overlay/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Voice</p>
              <p className="text-lg font-semibold text-white">Standard</p>
              <p className="text-xs text-muted">Select presets on iOS or web</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full border border-borderSoft/60 px-3 py-1 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Focused on top 5
            </span>
            <span className="rounded-full border border-borderSoft/60 px-3 py-1">Citations included</span>
            <span className="rounded-full border border-borderSoft/60 px-3 py-1">Download after render</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="glass-panel flex items-center gap-2 p-4 text-sm text-red-200">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
