import { v4 as uuid } from 'uuid';
import { EpisodeSegment, EpisodeSource, TopicQuery } from '../domain/types';
import { SegmentDialogueScript, Speaker } from '../llm/llm.types';

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
  queries: Array<TopicQuery | { citations: string[]; topicId: string; episodeId: string }>,
  episodeId: string,
): EpisodeSource[] {
  const seen = new Set<string>();
  const results: EpisodeSource[] = [];

  for (const query of queries || []) {
    for (const raw of query.citations || []) {
      const citation = (raw || '').trim();
      if (!citation) {
        continue;
      }
      const normalized = citation.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      results.push({
        id: uuid(),
        episodeId,
        sourceTitle: citation,
        url: citation,
        type: 'perplexity_citation',
      });
    }
  }

  return results;
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
  const rendered = (script?.turns || [])
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .filter((line) => line.trim().length > 0)
    .join('\n\n')
    .trim();
  return rendered || script.title || '';
}

export function coerceTextToDialogue(text: string): SegmentDialogueScript['turns'] {
  if (!text?.trim()) {
    return [];
  }
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ speaker: 'SPEAKER_1' as Speaker, text: line }));
}

export function estimateDurationSeconds(script: string): number {
  const words = (script || '').split(/\s+/).filter(Boolean).length;
  const seconds = words / 2.5; // ~150 wpm
  return Math.max(8, Math.round(seconds));
}
