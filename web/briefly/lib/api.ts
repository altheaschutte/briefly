import {
  Episode,
  Topic,
  Entitlements,
  BillingTier,
  BillingTierInfo,
  EpisodeSegment,
  EpisodeSource,
  SegmentDiveDeeperSeed
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:3344";

type UnauthorizedHandler = (message?: string) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function apiRequest<T>(
  path: string,
  method: HTTPMethod,
  token?: string,
  body?: Record<string, unknown>
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include"
    });
  } catch (err: any) {
    const message = err?.message ?? "Network error";
    throw new Error(`Could not reach Briefly API: ${message}`);
  }

  const parseErrorMessage = async () => {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") return parsed;
      return parsed?.message ?? parsed?.error ?? text;
    } catch {
      return text;
    }
  };

  if (res.status === 401) {
    const message = await parseErrorMessage();
    if (unauthorizedHandler) unauthorizedHandler(message || "Session expired. Please sign in again.");
    const err = new Error(message || "unauthorized");
    (err as any).code = "unauthorized";
    throw err;
  }

  if (!res.ok) {
    const message = await parseErrorMessage();
    if (res.status === 503 && message?.toLowerCase().includes("authentication service")) {
      if (unauthorizedHandler) unauthorizedHandler(message);
    }
    throw new Error(message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

const parseNumber = (value: any): number | undefined => {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDate = (value: any): string | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const normalizeSource = (raw: any): EpisodeSource => {
  const url = typeof raw?.url === "string" ? raw.url : undefined;
  return {
    id: raw?.id ?? raw?.source_id ?? crypto.randomUUID(),
    episodeId: raw?.episode_id ?? raw?.episodeId,
    segmentId: raw?.segment_id ?? raw?.segmentId,
    sourceTitle: raw?.sourceTitle ?? raw?.source_title ?? raw?.title,
    source_title: raw?.source_title,
    url,
    type: raw?.type
  };
};

const normalizeSegment = (raw: any): EpisodeSegment => {
  const sourcesArray = raw?.sources ?? raw?.raw_sources ?? raw?.rawSources;
  const sources = Array.isArray(sourcesArray) ? sourcesArray.map(normalizeSource) : undefined;
  const durationSeconds = parseNumber(raw?.duration_seconds ?? raw?.durationSeconds);
  const startTimeSeconds = parseNumber(raw?.start_time_seconds ?? raw?.startTimeSeconds);
  const orderIndex = parseNumber(raw?.orderIndex ?? raw?.order_index);

  return {
    id: raw?.id ?? raw?.segment_id ?? crypto.randomUUID(),
    title: raw?.title,
    orderIndex,
    order_index: orderIndex,
    script: raw?.script,
    rawContent: raw?.raw_content ?? raw?.rawContent,
    raw_content: raw?.raw_content ?? raw?.rawContent,
    audioUrl: raw?.audioUrl ?? raw?.audio_url,
    audio_url: raw?.audio_url ?? raw?.audioUrl,
    durationSeconds,
    duration_seconds: durationSeconds,
    startTimeSeconds,
    start_time_seconds: startTimeSeconds,
    sources,
    rawSources: sources,
    raw_sources: sources
  };
};

const normalizeDiveDeeperSeed = (raw: any): SegmentDiveDeeperSeed => ({
  id: raw?.id ?? crypto.randomUUID(),
  episodeId: raw?.episode_id ?? raw?.episodeId,
  segmentId: raw?.segment_id ?? raw?.segmentId,
  position: parseNumber(raw?.position),
  title: raw?.title ?? "Dive deeper",
  angle: raw?.angle,
  focusClaims: Array.isArray(raw?.focus_claims ?? raw?.focusClaims) ? raw.focus_claims ?? raw.focusClaims : undefined,
  seedQueries: Array.isArray(raw?.seed_queries ?? raw?.seedQueries) ? raw.seed_queries ?? raw.seedQueries : undefined,
  contextBundle: raw?.context_bundle ?? raw?.contextBundle,
  createdAt: parseDate(raw?.created_at ?? raw?.createdAt),
  updatedAt: parseDate(raw?.updated_at ?? raw?.updatedAt)
});

const normalizeEpisode = (raw: any): Episode => {
  const audio = raw.audio_url ?? raw.audioUrl ?? raw.audioURL;
  const cover = raw.cover_image_url ?? raw.coverImageUrl ?? raw.cover_imageURL;
  const diveDeeperSeeds = raw.dive_deeper_seeds ?? raw.diveDeeperSeeds;

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
    topics: Array.isArray(raw.topics) ? raw.topics.map(normalizeTopic) : undefined,
    segments: Array.isArray(raw.segments) ? raw.segments.map(normalizeSegment) : undefined,
    sources: Array.isArray(raw.sources) ? raw.sources.map(normalizeSource) : undefined,
    status: raw.status,
    showNotes: raw.show_notes ?? raw.showNotes,
    transcript: raw.transcript,
    coverImageUrl: typeof cover === "string" ? cover : undefined,
    coverPrompt: raw.cover_prompt ?? raw.coverPrompt,
    errorMessage: raw.error_message ?? raw.errorMessage,
    diveDeeperSeeds: Array.isArray(diveDeeperSeeds) ? diveDeeperSeeds.map(normalizeDiveDeeperSeed) : undefined
  };
};

const normalizeTopic = (raw: any): Topic => ({
  id: raw.id ?? raw.topic_id ?? crypto.randomUUID(),
  originalText: raw.originalText ?? raw.original_text ?? raw.title ?? "",
  orderIndex: parseNumber(raw.orderIndex ?? raw.order_index) ?? 0,
  isActive: Boolean(raw.isActive ?? raw.is_active ?? raw.active ?? true),
  isSeed: Boolean(raw.isSeed ?? raw.is_seed ?? false)
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

export async function deleteEpisode(token: string, id: string): Promise<void> {
  await apiRequest<void>(`/episodes/${id}`, "DELETE", token);
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

export async function fetchBillingTiers(token: string): Promise<BillingTierInfo[]> {
  return apiRequest<BillingTierInfo[]>("/billing/tiers", "GET", token);
}

export async function createStripeCheckoutSession(token: string, tier: BillingTier): Promise<{ url: string | null }> {
  return apiRequest<{ url: string | null }>("/billing/checkout-session", "POST", token, { tier });
}

export async function createStripePortalSession(token: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>("/billing/portal-session", "POST", token);
}

export async function requestDiveDeeperEpisode(
  token: string,
  episodeId: string,
  seedId: string,
  durationMinutes?: number
): Promise<{ episodeId: string; status?: string }> {
  const body = durationMinutes !== undefined ? { duration: durationMinutes } : undefined;
  const res = await apiRequest<any>(
    `/episodes/${episodeId}/dive-deeper/${seedId}`,
    "POST",
    token,
    body as any
  );
  return {
    episodeId: res?.episodeId ?? res?.id ?? res?.episode_id ?? seedId,
    status: res?.status
  };
}

export function isEpisodeReady(episode?: Episode) {
  if (!episode) return false;
  if (episode.status) {
    return episode.status.toLowerCase() === "ready";
  }
  return Boolean(episode.audioUrl);
}
