"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Loader2, Send, Sparkles, CheckCircle2, XCircle } from "lucide-react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type ProducerOutcome = {
  status?: "READY" | "NEEDS_USER_REPLY";
  assistantMessage?: string;
  nextQuestion?: string | null;
  episodeSpec?: {
    episodeTitle?: string;
    listenerIntent?: string;
    timeframe?: string;
    style?: string;
    durationMinutes?: number;
    segments?: Array<{ id?: string; title?: string; goal?: string; minutes?: number }>;
    personalization?: {
      moreOf?: string[];
      lessOf?: string[];
      callbacksToLastEpisode?: string[];
    };
    research?: {
      needed?: boolean;
      queries?: string[];
    };
  };
};

type WorkflowEvent = {
  type?: string;
  payload?: any;
  runId?: string;
  from?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3344";

const initialAssistant = "Tell me what you want to listen to and I’ll draft a plan.";

function extractOutcome(event: WorkflowEvent): ProducerOutcome | null {
  const payload = event?.payload ?? {};
  const candidate =
    payload?.outcome ??
    payload?.output?.outcome ??
    payload?.result?.outcome ??
    payload?.data?.outcome ??
    null;
  if (candidate && typeof candidate === "object") {
    return candidate as ProducerOutcome;
  }
  return null;
}

function extractThreadId(event: WorkflowEvent): string | null {
  const payload = event?.payload ?? {};
  const threadId = payload?.threadId ?? payload?.thread_id ?? payload?.thread ?? null;
  return typeof threadId === "string" ? threadId : null;
}

function extractSuspendPayload(event: WorkflowEvent): any | null {
  if (!event?.type) return null;
  const type = event.type.toLowerCase();
  if (!type.includes("suspend")) return null;
  return event.payload?.suspendPayload ?? event.payload ?? null;
}

function extractAssistantMessage(payload: any): string | null {
  const direct = payload?.outcome?.assistantMessage;
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  const messages = payload?.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && typeof last?.content === "string") {
      return last.content;
    }
  }
  return null;
}

export default function ProducerChatPage() {
  const session = useRequireAuth();
  const sessionUserId = session?.user?.id ?? null;
  const accessToken = session?.access_token;
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: crypto.randomUUID(), role: "assistant", content: initialAssistant }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ProducerOutcome | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const messagesRef = useRef(messages);
  const streamMessageIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const threadStorageKey = useMemo(() => {
    if (!sessionUserId) return null;
    return `producerChatThreadId:${sessionUserId}`;
  }, [sessionUserId]);

  useEffect(() => {
    if (!threadStorageKey || !threadId) return;
    localStorage.setItem(threadStorageKey, threadId);
  }, [threadId, threadStorageKey]);

  useEffect(() => {
    if (!threadStorageKey || !accessToken) return;
    if (threadId) return;
    const storedThreadId = localStorage.getItem(threadStorageKey);
    if (!storedThreadId) return;

    const loadHistory = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/producer/chat/thread/${storedThreadId}`, {
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          }
        });
        if (!response.ok) {
          throw new Error(`Thread load failed (${response.status})`);
        }
        const data = await response.json();
        const history = Array.isArray(data?.messages) ? data.messages : [];
        const latestOutcome = data?.latestOutcome ?? null;
        if (history.length > 0) {
          setMessages(
            history
              .filter((message: any) => message?.role === "user" || message?.role === "assistant")
              .map((message: any, index: number) => ({
                id: message?.id ?? `${storedThreadId}-${index}`,
                role: message.role as ChatRole,
                content: message.content ?? ""
              }))
          );
        }
        if (latestOutcome) {
          setOutcome(latestOutcome);
          if (latestOutcome.status === "READY") {
            setAwaitingConfirm(true);
          }
        }
        setThreadId(storedThreadId);
      } catch {
        localStorage.removeItem(threadStorageKey);
      }
    };

    void loadHistory();
  }, [accessToken, threadId, threadStorageKey]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  const summary = useMemo(() => {
    const spec = outcome?.episodeSpec;
    if (!spec) return null;
    const headline = spec.episodeTitle || "Episode plan";
    const intent = spec.listenerIntent;
    const timeframe = spec.timeframe;
    const style = spec.style;
    const duration = spec.durationMinutes ? `${spec.durationMinutes} min` : null;
    const segments = Array.isArray(spec.segments) ? spec.segments : [];
    const fallbackPersonalization = userProfile
      ? {
          moreOf: Array.isArray(userProfile.moreOf) ? userProfile.moreOf : [],
          lessOf: Array.isArray(userProfile.lessOf) ? userProfile.lessOf : [],
          callbacksToLastEpisode: Array.isArray(userProfile.callbacksToLastEpisode)
            ? userProfile.callbacksToLastEpisode
            : []
        }
      : undefined;
    const personalization = spec.personalization ?? fallbackPersonalization;
    const normalizedPersonalization = personalization
      ? {
          moreOf: Array.isArray(personalization.moreOf) ? personalization.moreOf : [],
          lessOf: Array.isArray(personalization.lessOf) ? personalization.lessOf : [],
          callbacksToLastEpisode: Array.isArray(personalization.callbacksToLastEpisode)
            ? personalization.callbacksToLastEpisode
            : []
        }
      : undefined;
    const segmentSummaries = segments.map((segment, index) => ({
      key: segment.id ?? segment.title ?? segment.goal ?? `segment-${index + 1}`,
      title: segment.title ?? segment.id ?? `Segment ${index + 1}`,
      goal: segment.goal,
      minutes: segment.minutes
    }));
    return {
      headline,
      intent,
      timeframe,
      style,
      duration,
      segments: segmentSummaries,
      researchNeeded: spec.research?.needed,
      researchQueries: spec.research?.queries ?? [],
      personalization: normalizedPersonalization
    };
  }, [outcome, userProfile]);

  const consumeStream = async (
    response: Response,
    options?: { assistantMessageId?: string | null; allowAssistantUpdate?: boolean }
  ) => {
    const assistantMessageId = options?.assistantMessageId ?? null;
    const allowAssistantUpdate = options?.allowAssistantUpdate ?? true;
    const headerRunId = response.headers.get("x-run-id");
    if (headerRunId) {
      setRunId(headerRunId);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Streaming response unavailable.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const dataLine = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (!dataLine || dataLine === "[DONE]") continue;
        let event: WorkflowEvent | null = null;
        try {
          event = JSON.parse(dataLine) as WorkflowEvent;
        } catch {
          continue;
        }

        if (event.runId) {
          setRunId(event.runId);
        }

        const incomingThreadId = extractThreadId(event);
        if (incomingThreadId) {
          setThreadId(incomingThreadId);
        }

        const nextOutcome = extractOutcome(event);
        if (nextOutcome) {
          setOutcome(nextOutcome);
          if (allowAssistantUpdate && nextOutcome.assistantMessage && assistantMessageId) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: nextOutcome.assistantMessage ?? message.content }
                  : message
              )
            );
          }
        }

        const suspendPayload = extractSuspendPayload(event);
        if (suspendPayload) {
          const suspendOutcome = suspendPayload?.outcome as ProducerOutcome | undefined;
          if (suspendOutcome) {
            setOutcome(suspendOutcome);
            if (suspendOutcome.status === "READY") {
              setAwaitingConfirm(true);
            }
          }
          if (suspendPayload?.userProfile) {
            setUserProfile(suspendPayload.userProfile);
          }
          const suspendMessage = extractAssistantMessage(suspendPayload);
          if (allowAssistantUpdate && suspendMessage && assistantMessageId) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: suspendMessage }
                  : message
              )
            );
          }
        }

        if (event.type?.toLowerCase().includes("suspend")) {
          setAwaitingConfirm(true);
        }
      }
    }
  };

  const startStream = async (userMessage: string) => {
    if (!accessToken) return;
    setError(null);
    setIsStreaming(true);
    setAwaitingConfirm(false);
    setIsConfirmed(false);

    const assistantId = crypto.randomUUID();
    streamMessageIdRef.current = assistantId;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "…" }]);

    const history = [...messagesRef.current, { id: crypto.randomUUID(), role: "user", content: userMessage }];
    const activeThreadId = threadId ?? crypto.randomUUID();
    if (!threadId) {
      setThreadId(activeThreadId);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/producer/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          userMessage,
          threadId: activeThreadId,
          messages: history.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed (${response.status})`);
      }

      await consumeStream(response, { assistantMessageId: assistantId, allowAssistantUpdate: true });
    } catch (err: any) {
      setError(err?.message ?? "Unable to stream producer response.");
      setMessages((prev) =>
        prev.map((message) =>
          message.id === streamMessageIdRef.current ? { ...message, content: "Something went wrong." } : message
        )
      );
    } finally {
      setIsStreaming(false);
      streamMessageIdRef.current = null;
    }
  };

  const resumeStream = async (confirmed: boolean, revisionMessage?: string) => {
    if (!accessToken || !runId || isResuming) return;
    setError(null);
    setAwaitingConfirm(false);
    setIsResuming(true);

    let assistantId: string | null = null;
    const resumeMessages = [...messagesRef.current];
    if (confirmed) {
      if (!outcome?.episodeSpec) {
        setError("Episode plan is missing. Please try again.");
        setAwaitingConfirm(true);
        setIsResuming(false);
        return;
      }
      try {
        const confirmResp = await fetch(`${API_BASE_URL}/producer/chat/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({
            outcome,
            threadId,
            userProfile
          })
        });
        if (!confirmResp.ok) {
          const text = await confirmResp.text();
          throw new Error(text || `Confirm failed (${confirmResp.status})`);
        }
      } catch (err: any) {
        setError(err?.message ?? "Failed to save the episode plan.");
        setAwaitingConfirm(true);
        setIsResuming(false);
        return;
      }
      assistantId =
        [...messagesRef.current].reverse().find((message) => message.role === "assistant")?.id ?? null;
      setIsConfirmed(true);
    } else if (revisionMessage) {
      const trimmed = revisionMessage.trim();
      if (!trimmed) {
        setError("Add a revision note before resuming.");
        setIsResuming(false);
        return;
      }
      setInput("");
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
      resumeMessages.push({ id: crypto.randomUUID(), role: "user", content: trimmed });
      assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId!, role: "assistant", content: "Updating plan…" }]);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/producer/chat/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          runId,
          confirmed,
          userMessage: confirmed ? undefined : revisionMessage?.trim(),
          threadId,
          messages: resumeMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Resume failed (${response.status})`);
      }

      await consumeStream(response, {
        assistantMessageId: assistantId,
        allowAssistantUpdate: true
      });
    } catch (err: any) {
      setError(err?.message ?? "Unable to resume producer workflow.");
      setIsConfirmed(false);
    } finally {
      setIsResuming(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || awaitingConfirm || isResuming) return;
    setInput("");
    if (isConfirmed) {
      setThreadId(null);
      setRunId(null);
      setIsConfirmed(false);
      if (threadStorageKey) {
        localStorage.removeItem(threadStorageKey);
      }
    }
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    await startStream(trimmed);
  };

  return (
    <div id="producer-chat-root" className="flex h-full w-full">
      <div className="mx-auto flex h-full w-full justify-center px-6 lg:pr-[360px]">
        <section className="relative flex h-full w-full max-w-2xl flex-col">
          <header className="pb-4 pt-8">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-tealSoft">
              <Sparkles className="h-4 w-4 text-accent" />
              Producer chat
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-40">
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
                {message.role === "assistant" ? (
                  <div className="prose prose-sm mt-2 max-w-none prose-a:text-accent prose-p:leading-relaxed">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="mt-2 inline-block max-w-[85%] whitespace-pre-wrap rounded-[30px] bg-[#e9e4de] px-4 py-3 text-sm text-ink">
                    {message.content}
                  </p>
                )}
              </div>
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Streaming response...
              </div>
            )}
            {error && (
              <div className="text-xs text-red-300">
                {error}
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <footer className="fixed bottom-0 left-0 right-0 z-20 bg-midnight/95 backdrop-blur">
            <div className="mx-auto flex w-full justify-center px-6 py-4 lg:pr-[360px]">
              <div className="flex w-full max-w-2xl flex-col gap-3 md:flex-row">
                <input
                  className="flex-1 rounded-full border border-borderSoft/70 px-4 py-3 text-sm text-ink outline-none"
                  placeholder={
                    awaitingConfirm
                      ? "Add a revision note if needed..."
                      : "Describe the episode you want..."
                  }
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={isStreaming || isResuming}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-borderSoft/70 px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-60"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming || awaitingConfirm || isResuming}
                >
                  Send
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </footer>
        </section>
      </div>

      <aside className="mt-10 border-t border-borderSoft/60 px-6 py-8 lg:fixed lg:right-0 lg:top-24 lg:mt-0 lg:h-[calc(100vh-6rem)] lg:w-[360px] lg:border-t-0">
        <div className="flex h-full flex-col gap-6 overflow-y-auto">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Episode plan</p>
            <h2 className="mt-3 text-xl font-semibold text-ink">
              {summary?.headline ?? "Waiting on a plan…"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {summary?.intent
                ? `Listener intent: ${summary.intent}`
                : "Send a prompt to generate a structured plan."}
            </p>
          </div>

          {summary && (
            <div className="space-y-6 text-sm text-muted">
              <div className="flex flex-wrap gap-2 text-xs text-ink">
                {summary.timeframe && (
                  <span className="rounded-full border border-borderSoft/60 px-3 py-1">
                    {summary.timeframe}
                  </span>
                )}
                {summary.style && (
                  <span className="rounded-full border border-borderSoft/60 px-3 py-1">
                    {summary.style}
                  </span>
                )}
                {summary.duration && (
                  <span className="rounded-full border border-borderSoft/60 px-3 py-1">
                    {summary.duration}
                  </span>
                )}
              </div>

              {summary.segments.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Segments</p>
                  {summary.segments.map((segment) => (
                    <div key={segment.key} className="border-b border-borderSoft/40 pb-3">
                      <div className="flex items-center justify-between gap-3 text-sm text-ink">
                        <p className="font-semibold">{segment.title}</p>
                        {segment.minutes ? <span className="text-xs text-muted">{segment.minutes} min</span> : null}
                      </div>
                      {segment.goal && <p className="mt-1 text-xs text-muted">{segment.goal}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-tealSoft">
                  {summary.researchNeeded ? (
                    <CheckCircle2 className="h-4 w-4 text-teal" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted" />
                  )}
                  {summary.researchNeeded ? "Research required" : "No research required"}
                </div>
                {summary.researchQueries.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                    {summary.researchQueries.slice(0, 5).map((query) => (
                      <li key={query}>{query}</li>
                    ))}
                  </ul>
                )}
              </div>

              {summary.personalization && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">More of</p>
                    <p className="mt-2 text-sm text-ink">
                      {summary.personalization.moreOf?.length ? summary.personalization.moreOf.join(", ") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-tealSoft">Less of</p>
                    <p className="mt-2 text-sm text-ink">
                      {summary.personalization.lessOf?.length ? summary.personalization.lessOf.join(", ") : "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {awaitingConfirm && (
            <div className="space-y-3 border-t border-borderSoft/60 pt-4 text-sm text-ink">
              <p>Episode plan ready. Confirm to save and generate.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-borderSoft/70 px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent disabled:opacity-60"
                  onClick={() => resumeStream(true)}
                  disabled={!runId || isResuming || isStreaming}
                >
                  Confirm
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-borderSoft/70 px-4 py-2 text-xs font-semibold text-ink transition hover:border-accent disabled:opacity-60"
                  onClick={() => resumeStream(false, input)}
                  disabled={!runId || isResuming || isStreaming || !input.trim()}
                >
                  Revise with input
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              {!runId && <p className="text-xs text-muted">Waiting for run id from stream…</p>}
            </div>
          )}
          {isConfirmed && !awaitingConfirm && (
            <div className="border-t border-borderSoft/60 pt-4 text-sm text-muted">
              Episode plan confirmed. We’ll start generating your episode now.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
