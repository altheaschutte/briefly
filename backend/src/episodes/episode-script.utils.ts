import { v4 as uuid } from 'uuid';
import { EpisodeSegment, EpisodeSource, TopicQuery } from '../domain/types';
import { SegmentDialogueScript, Speaker } from '../llm/llm.types';
import { PerplexityCitation } from '../perplexity/perplexity.service';

export function selectFreshQueries(candidateQueries: string[], previousQueries: TopicQuery[]): string[] {
  const used = new Set(
    (previousQueries || []).map((q) => q.query.trim().toLowerCase()).filter((q) => q.length > 0),
  );
  const seen = new Set<string>();
  const fresh: string[] = [];

  for (const candidate of candidateQueries || []) {
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (used.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    fresh.push(normalized);
  }
  return fresh;
}

export function buildEpisodeSources(
  queries: Array<
    TopicQuery | { citations: Array<string | PerplexityCitation>; citationMetadata?: PerplexityCitation[] }
  >,
  episodeId: string,
  segmentId?: string,
): EpisodeSource[] {
  const seen = new Set<string>();
  const results: EpisodeSource[] = [];

  (queries || []).forEach((query) => {
    const citationMetadata = (query as any)?.citationMetadata as PerplexityCitation[] | undefined;
    const cited = Array.isArray(query.citations) ? query.citations : [];
    const candidates: Array<string | PerplexityCitation> = [
      ...(citationMetadata || []),
      ...cited,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeCitation(candidate);
      if (!normalized) continue;

      const dedupeKey = normalizeUrlForKey(normalized.url);
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      results.push({
        id: uuid(),
        episodeId,
        segmentId,
        sourceTitle: normalized.title || deriveSourceTitle(normalized.url),
        url: normalized.url,
        type: 'perplexity_citation',
      });
    }
  });

  return results;
}

function normalizeCitation(input: string | PerplexityCitation): { url: string; title?: string } | null {
  if (typeof input === 'string') {
    const url = input.trim();
    if (!url) {
      return null;
    }
    return { url, title: deriveSourceTitle(url) };
  }

  const url = (input.url || '').trim();
  if (!url) {
    return null;
  }
  const title = (input.title || input.source || '').trim();
  return { url, title: title || undefined };
}

function deriveSourceTitle(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeUrlForKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const normalized = parsed.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1).toLowerCase() : normalized.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function buildSegmentContent(
  topicTitle: string,
  queries: Array<TopicQuery | { query: string; answer: string; orderIndex: number }>,
): string {
  if (!queries.length) {
    return topicTitle;
  }
  const ordered = [...queries].sort((a, b) => a.orderIndex - b.orderIndex);
  return ordered
    .map((query, idx) => {
      const answer = query.answer?.trim() || 'No answer returned';
      return `Query ${idx + 1}: ${query.query}\nFindings: ${answer}`;
    })
    .join('\n\n');
}

export function combineDialogueScripts(segments: EpisodeSegment[]): SegmentDialogueScript {
  const turns: SegmentDialogueScript['turns'] = [];
  const ordered = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const segment of ordered) {
    if (segment.dialogueScript?.turns?.length) {
      turns.push(...segment.dialogueScript.turns);
    } else if (segment.script) {
      turns.push(...coerceTextToDialogue(segment.script));
    }
  }

  const combinedIntent: SegmentDialogueScript['intent'] =
    ordered.length === 1 ? ordered[0]?.intent || 'single_story' : 'multi_item';

  return {
    title: 'Episode Dialogue',
    intent: combinedIntent,
    turns,
  };
}

export function renderDialogueScript(script: SegmentDialogueScript): string {
  const turns = (script?.turns || []).filter((turn) => Boolean(turn?.text?.trim()));
  if (!turns.length) {
    return script?.title || '';
  }

  const speakers = new Set(turns.map((turn) => turn.speaker));
  const singleSpeaker = speakers.size === 1;
  const rendered = singleSpeaker
    ? turns.map((turn) => turn.text.trim()).join('\n\n')
    : turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n\n');
  return rendered.trim();
}

export function coerceTextToDialogue(text: string): SegmentDialogueScript['turns'] {
  if (!text?.trim()) {
    return [];
  }
  const normalized = text.replace(/\r/g, '').trim();
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return paragraphs.map((paragraph) => ({ speaker: 'SPEAKER_1' as Speaker, text: paragraph }));
}

export function estimateDurationSeconds(script: string): number {
  const words = (script || '').split(/\s+/).filter(Boolean).length;
  const seconds = words / 2.5; // ~150 wpm
  return Math.max(8, Math.round(seconds));
}
