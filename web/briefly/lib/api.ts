import { AuthToken, Episode, Topic, Entitlements } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BRIEFLY_API_BASE_URL ||
  "http://127.0.0.1:3344";

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function apiRequest<T>(
  path: string,
  method: HTTPMethod,
  token?: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include"
  });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

const normalizeEpisode = (raw: any): Episode => {
  const parseNumber = (value: any) => {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseDate = (value: any) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };

  const audio = raw.audio_url ?? raw.audioUrl ?? raw.audioURL;
  const cover = raw.cover_image_url ?? raw.coverImageUrl ?? raw.cover_imageURL;

  return {
    id: raw.id ?? raw.episode_id ?? crypto.randomUUID(),
    title: raw.title ?? "Briefly episode",
    episodeNumber: raw.episode_number ?? raw.episodeNumber,
    summary: raw.summary,
    description: raw.description ?? raw.short_description ?? raw.episode_description,
    audioUrl: typeof audio === "string" ? audio : undefined,
    durationSeconds: parseNumber(raw.duration_seconds ?? raw.durationSeconds),
    targetDurationMinutes: parseNumber(raw.target_duration_minutes ?? raw.targetDurationMinutes),
    createdAt: parseDate(raw.created_at ?? raw.createdAt),
    updatedAt: parseDate(raw.updated_at ?? raw.updatedAt),
    publishedAt: parseDate(raw.published_at ?? raw.publishedAt),
    topics: raw.topics,
    segments: raw.segments,
    sources: raw.sources,
    status: raw.status,
    showNotes: raw.show_notes ?? raw.showNotes,
    transcript: raw.transcript,
    coverImageUrl: typeof cover === "string" ? cover : undefined,
    coverPrompt: raw.cover_prompt ?? raw.coverPrompt,
    errorMessage: raw.error_message ?? raw.errorMessage
  };
};

const normalizeTopic = (raw: any): Topic => ({
  id: raw.id ?? raw.topic_id ?? crypto.randomUUID(),
  originalText: raw.originalText ?? raw.original_text ?? raw.title ?? "",
  orderIndex: Number(raw.orderIndex ?? raw.order_index ?? 0),
  isActive: Boolean(raw.isActive ?? raw.is_active ?? raw.active ?? true)
});

export async function fetchEpisodes(token: string): Promise<Episode[]> {
  const data = await apiRequest<any>("/episodes", "GET", token);
  const episodesArray: any[] = Array.isArray(data) ? data : data?.data ?? [];
  return episodesArray.map(normalizeEpisode);
}

export async function fetchTopics(token: string): Promise<Topic[]> {
  const data = await apiRequest<any>("/topics", "GET", token);
  return (data as any[]).map(normalizeTopic);
}

export async function fetchEpisodeById(token: string, id: string): Promise<Episode> {
  const data = await apiRequest<any>(`/episodes/${id}`, "GET", token);
  return normalizeEpisode(data);
}

export async function createTopic(token: string, originalText: string): Promise<Topic> {
  const data = await apiRequest<any>(
    "/topics",
    "POST",
    token,
    { original_text: originalText }
  );
  return normalizeTopic(data);
}

export async function updateTopic(token: string, topic: Topic): Promise<Topic> {
  const body = {
    original_text: topic.originalText,
    is_active: topic.isActive,
    order_index: topic.orderIndex
  };
  const data = await apiRequest<any>(`/topics/${topic.id}`, "PATCH", token, body);
  return normalizeTopic(data);
}

export async function deleteTopic(token: string, id: string): Promise<void> {
  await apiRequest<void>(`/topics/${id}`, "DELETE", token);
}

export async function requestEpisodeGeneration(token: string): Promise<{ episodeId: string }> {
  const res = await apiRequest<any>("/episodes", "POST", token);
  const episodeId = res.episodeId ?? res.id ?? res.episode_id;
  return { episodeId };
}

export async function fetchEntitlements(token: string): Promise<Entitlements> {
  return apiRequest<Entitlements>("/me/entitlements", "GET", token);
}

export async function createStripePortalSession(token: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/billing/portal-session", "POST", token);
}

export function isEpisodeReady(episode?: Episode) {
  if (!episode) return false;
  if (episode.status) {
    return episode.status.toLowerCase() === "ready";
  }
  return Boolean(episode.audioUrl);
}
