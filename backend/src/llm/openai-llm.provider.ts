import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { EpisodeMetadata, LlmProvider } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { DialogueTurn, SegmentDialogueScript, TopicIntent, TopicQueryPlan } from './llm.types';

export interface OpenAiLlmProviderOptions {
  apiKeyConfigKey?: string;
  apiKeyConfigKeys?: string[];
  baseUrlConfigKey?: string;
  baseUrlConfigKeys?: string[];
  defaultBaseUrl?: string;
  defaultQueryModel?: string;
  defaultScriptModel?: string;
  defaultExtractionModel?: string;
  rewriteModelConfigKeys?: string[];
  scriptModelConfigKeys?: string[];
  extractionModelConfigKeys?: string[];
  providerLabel?: string;
}

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private client: OpenAI | null = null;
  private readonly queryModel: string;
  private readonly scriptModel: string;
  private readonly transcriptExtractionModel: string;
  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private readonly providerLabel: string;

  private readonly apiKeyConfigKeys: string[];
  private readonly baseUrlConfigKeys: string[];
  private readonly defaultBaseUrl?: string;
  private readonly rewriteModelConfigKeys: string[];
  private readonly scriptModelConfigKeys: string[];
  private readonly extractionModelConfigKeys: string[];

  constructor(private readonly configService: ConfigService, options: OpenAiLlmProviderOptions = {}) {
    this.apiKeyConfigKeys = this.normalizeKeys(options.apiKeyConfigKeys, options.apiKeyConfigKey, 'OPENAI_API_KEY');
    this.baseUrlConfigKeys = this.normalizeKeys(options.baseUrlConfigKeys, options.baseUrlConfigKey, 'OPENAI_BASE_URL');
    this.rewriteModelConfigKeys = this.normalizeKeys(
      options.rewriteModelConfigKeys,
      undefined,
      'LLM_PROVIDER_REWRITE_MODEL',
    );
    this.scriptModelConfigKeys = this.normalizeKeys(
      options.scriptModelConfigKeys,
      undefined,
      'LLM_PROVIDER_SCRIPT_MODEL',
    );
    this.extractionModelConfigKeys = this.normalizeKeys(
      options.extractionModelConfigKeys,
      undefined,
      'LLM_PROVIDER_EXTRACTION_MODEL',
    );
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.queryModel = this.getFirstConfigValue(this.rewriteModelConfigKeys) ?? options.defaultQueryModel ?? 'gpt-4.1';
    this.scriptModel = this.getFirstConfigValue(this.scriptModelConfigKeys) ?? options.defaultScriptModel ?? 'gpt-4.1';
    this.transcriptExtractionModel =
      this.getFirstConfigValue(this.extractionModelConfigKeys) ?? options.defaultExtractionModel ?? this.queryModel;
    this.providerLabel = options.providerLabel ?? 'OpenAI LLM provider';
  }

  async generateTopicQueries(topic: string, previousQueries: string[]): Promise<TopicQueryPlan> {
    const client = this.getClient();
    const isoDate = new Date().toISOString().split('T')[0];
    const history = (previousQueries || []).map((q) => q.trim()).filter(Boolean).slice(-12);
    const historyBlock = history.length ? history.map((q, idx) => `${idx + 1}. ${q}`).join('\n') : 'None';
    const messages = [
      {
        role: 'system',
        content: `You craft high-signal web search queries for a research agent.

First, infer the topic intent:
- "single_story": user wants ONE excellent, detailed item (e.g., "a story", "an interesting story", "deep dive", "profile", "tell me one story")
- "multi_item": user wants multiple updates/items (e.g., "latest", "roundup", "updates", "events", "top", "compare", "near me", "this weekend")

Rules:
- Output between 1 and 5 queries.
- Default to 1 query for "single_story" or multiple for a more indepth longer segment.
- Consider the assumed knowledge of the user if the query implies existing knowledge.
- Use 3-5 queries only for "multi_item" topics OR if the topic contains multiple sub-areas that truly require separate queries.
- If "single_story", write queries designed to return richly detailed results covering different aspects of the topic or diving deeper into the topic. Add modifiers like: longform, feature, narrative, oral history, investigation, biography.
- If "multi_item", cover distinct angles and avoid overlaps.
- Do not repeat, lightly rephrase, or overlap with any previous queries supplied.
- Keep each query lean, disambiguated (entities, locations, timeframes), and ready for direct use.

Recency guidance:
- For news topics, prioritize recency (${isoDate}).
- For history/evergreen topics, do NOT force recency; prioritize authoritative sources and longform quality.

Respond as JSON:
{"intent":"single_story"|"multi_item","queries":["query one","query two"]}.`,
      },
      {
        role: 'user',
        content: `Topic brief: ${topic}
Previously used queries (avoid repeating): 
${historyBlock}`,
      },
    ] satisfies ChatCompletionMessageParam[];
    const response = await client.chat.completions.create({
      model: this.queryModel,
      messages,
      temperature: 0.35,
      max_tokens: 220,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerLabel} returned empty content for topic queries`);
    }
    const plan = this.parseTopicQueryPlan(content);
    if (!plan.queries.length) {
      throw new Error(`${this.providerLabel} did not return any topic queries`);
    }
    const queries = plan.intent === 'single_story' ? plan.queries.slice(0, 1) : plan.queries.slice(0, 5);
    return { intent: plan.intent, queries };
  }

  async extractTopicBriefs(transcript: string): Promise<string[]> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: this.transcriptExtractionModel,
      temperature: 0.25,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract concise topic briefs from a spoken transcript. Return 1-4 distinct, specific topic briefs capturing what the user wants to hear about. Avoid filler, requests to play music, or chit-chat. Respond as JSON with shape {"topics": ["brief 1", "brief 2"]}.',
        },
        { role: 'user', content: transcript },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerLabel} returned empty content for transcript topic extraction`);
    }

    const topics = this.parseList(content);
    if (!topics.length) {
      throw new Error(`${this.providerLabel} did not return any topics from transcript extraction`);
    }
    return topics;
  }

  async generateSeedTopics(userInsight: string): Promise<string[]> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: this.queryModel,
      temperature: 0.55,
      max_tokens: 320,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You craft 5 personalized topic prompts for a daily AI audio briefing app called Briefly.

Rules:
- Use the user's self-description to naturally personalize when relevant.
- If the user lists multiple interests (commas, "and", or new lines), treat them as distinct; spread topics across different interests instead of merging them into one combined prompt.
- Each topic must be under 18 words.
- Start with an action verb: Tell me, Update me, Share, Highlight, Reveal, Dive into, Alert me to, Explore, Uncover.
- Keep them specific, timely (2025 energy), and curiosity-driven—breakthroughs, hopeful trends, surprising progress.
- Avoid combining unrelated interests in one topic; keep each topic focused and crisp.
- Avoid generic headlines or vague phrasing. No numbering or explanations.
- Output strictly as JSON: {"topics":["topic 1","topic 2","topic 3","topic 4","topic 5"]}.`,
        },
        {
          role: 'user',
          content: `User insight: ${userInsight?.trim() || 'None provided'}`,
        },
      ] satisfies ChatCompletionMessageParam[],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerLabel} returned empty content for seed topics`);
    }
    const topics = this.parseList(content).slice(0, 5);
    if (!topics.length) {
      throw new Error(`${this.providerLabel} did not return any seed topics`);
    }
    return topics;
  }

  async generateCoverMotif(title: string, topics: string[] = []): Promise<string> {
    const client = this.getClient();
    const topicHints = (topics || [])
      .map((topic) => topic?.trim())
      .filter((topic): topic is string => Boolean(topic))
      .slice(0, 2);
    const topicLine = topicHints.length ? `Topics: ${topicHints.join(' | ')}` : 'Topics: None';
    const examples = `Examples (stay literal and drawable):
Title: The Quantum Internet → Motif: interlaced fiber loop around two signal nodes
Title: Coastal Storm Prep → Motif: twin radar arcs bracketing a shoreline beacon
Title: Startup Burnout → Motif: tapering battery line encircled by climbing steps`;
    const messages = [
      {
        role: 'system',
        content: `You propose a single visual motif for abstract, text-free line art posters.
Rules:
- Return ONE noun-based motif that can be drawn as a single continuous line plus 1–2 supporting shapes.
- 12 words max.
- No people, faces, hands, bodies, silhouettes, logos, brand marks, or copyrighted characters.
- No text, no letters, no numbers.
- Keep it safe/PG and concrete (objects, signals, shapes, tools).
- Style hint: abstract, single-line focal shape + 1–2 supporting shapes.
Respond as JSON only: {"motif":"..."}.
${examples}`,
      },
      {
        role: 'user',
        content: `Title: ${title || 'Untitled'}
${topicLine}
Describe the motif only.`,
      },
    ] satisfies ChatCompletionMessageParam[];

    const response = await client.chat.completions.create({
      model: this.queryModel,
      messages,
      temperature: 0.3,
      max_tokens: 140,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerLabel} returned empty content for cover motif`);
    }
    const motif = this.parseMotif(content);
    if (!motif) {
      throw new Error(`${this.providerLabel} did not return a valid cover motif`);
    }
    return motif;
  }

  async generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    targetDurationMinutes?: number,
    instruction?: string,
  ): Promise<string> {
    const client = this.getClient();
    const sourceList =
      sources
        .filter((s) => Boolean(s))
        .map((s: EpisodeSource) => `- ${s.sourceTitle || s.url || 'source'} (${s.url || 'unknown'})`)
        .join('\n') || '- None provided';
    const instructionLine = instruction?.trim()
      ? `\nInstruction (follow strictly): ${instruction.trim()}`
      : '';
    const durationLabel = targetDurationMinutes ? `${targetDurationMinutes}-minute` : 'about 2 minute';
    const messages = [
      {
        role: 'system',
        content: `You are an expert podcast segment writer. Write a high-quality SINGLE-HOST narration for TTS.

Hard rules:
- Use ONLY the provided Findings. Do not invent facts, names, numbers, dates, or quotes.
- If Findings are thin or uncertain, say so plainly and stick to what is known.
- No URLs spoken aloud.
- Spell out numbers and dates.
- Do NOT include speaker labels, turn markers, titles, headings, bullets, or JSON.
- Do NOT include bracketed audio direction tags (no [pause], [excited], etc.).
- Avoid meta commentary (no “in this segment”, “coming up”, “let’s dive in”, “today we’ll…”).
- Avoid corny/overdramatic openers. Do NOT start with “Imagine…”, “Picture this…”, “Close your eyes…”, or “What if…”.
- Avoid second-person narration (“you”, “your”) unless the Findings explicitly require it.

Style:
- Warm, curious, grounded.
- Tight, vivid, and concrete.
- Use short paragraphs (1–3 sentences each). Aim for 5–9 paragraphs.
- Open with a compelling hook; end with a memorable close that ties back to why it matters.
Hook guidance:
- Start with a concrete detail from the Findings in the first 1–2 sentences (a person, place, event, or specific fact).
- Prefer straightforward scene-setting over hype. No melodrama, no grand claims.

Target length:
- Aim for a ${durationLabel} narration at ~150 words/minute.

Output format:
- Plain text only.`,
      },
      {
        role: 'user',
        content: `Topic prompt (context only): ${title}
Findings (must-use facts):
${findings}

Sources (for context only):
${sourceList}${instructionLine}`,
      },
    ] satisfies ChatCompletionMessageParam[];

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let content: string | null | undefined = null;
      try {
        const response = await client.chat.completions.create({
          model: this.scriptModel,
          messages,
          temperature: 0.65,
          max_tokens: 1200,
        });
        content = response.choices[0]?.message?.content;
      } catch (error) {
        if (this.isRetryableLlmError(error) && attempt < maxAttempts) {
          this.logger.warn(
            `${this.providerLabel} request failed for segment script (attempt ${attempt}/${maxAttempts}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }

      const cleaned = (content || '').trim();
      if (!cleaned) {
        if (attempt < maxAttempts) {
          const snippet = this.truncateForLogs(content || '');
          this.logger.warn(
            `${this.providerLabel} returned empty/invalid narration for segment script (attempt ${attempt}/${maxAttempts}). Response snippet: ${snippet}`,
          );
          continue;
        }
        throw new Error(`${this.providerLabel} returned empty content for segment script`);
      }

      return cleaned;
    }
    throw new Error(`${this.providerLabel} failed to generate a segment script`);
  }

//   async enhanceSegmentDialogueForElevenV3(script: SegmentDialogueScript): Promise<SegmentDialogueScript> {
//     const client = this.getClient();
//     const messages = [
//       {
//         role: 'system',
//         content: `You enhance an existing SINGLE-SPEAKER narration for ElevenLabs v3.

// Primary goal:
// - Improve delivery by inserting concise audio tags in square brackets.

// Hard rules:
// - DO NOT change, remove, or reorder any words in any turn text.
// - You may ONLY insert audio tags (auditory voice cues) and blank lines for pauses.
// - Tags must be placed immediately before or after the words they color.
// - No non-voice stage directions (no [music], [walking], etc.).
// - Do not add speaker names or name cues inside any text.
// - All turns already use SPEAKER_1. Do not introduce new speakers or change speaker labels.
// - Keep tags sparse: typically 1 tag every 2–4 turns, unless the moment clearly benefits.

// Return JSON only in the exact same shape:
// {"title": string, "intent": "single_story"|"multi_item", "turns":[{"speaker":"SPEAKER_1","text":string}...]}`,
//       },
//       {
//         role: 'user',
//         content: `Enhance this dialogue by adding sparse delivery tags without changing a single word. Return valid JSON.\n\n${JSON.stringify(script, null, 2)}`,
//       },
//     ] satisfies ChatCompletionMessageParam[];

//     const maxAttempts = 2;
//     for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
//       let content: string | null | undefined;
//       try {
//         const response = await client.chat.completions.create({
//           model: this.scriptModel,
//           messages,
//           temperature: 0.35,
//           max_tokens: 1100,
//           response_format: { type: 'json_object' },
//         });
//         content = response.choices[0]?.message?.content;
//       } catch (error) {
//         if (this.isRetryableLlmError(error) && attempt < maxAttempts) {
//           this.logger.warn(
//             `${this.providerLabel} request failed for dialogue enhancement (attempt ${attempt}/${maxAttempts}): ${
//               error instanceof Error ? error.message : String(error)
//             }`,
//           );
//           continue;
//         }
//         throw error;
//       }

//       if (!content) {
//         if (attempt < maxAttempts) {
//           this.logger.warn(`${this.providerLabel} returned empty content for dialogue enhancement (attempt ${attempt}/${maxAttempts})`);
//           continue;
//         }
//         throw new Error(`${this.providerLabel} returned empty content for dialogue enhancement`);
//       }

//       try {
//         const enhancedParsed = this.parseDialogueScript(content, script.intent, script.title);
//         const enhanced: SegmentDialogueScript = {
//           ...enhancedParsed,
//           turns: enhancedParsed.turns.map((turn) => ({ ...turn, speaker: 'SPEAKER_1' as const })),
//         };
//         const sameLength = enhanced.turns.length === script.turns.length;
//         const sameSpeakers =
//           sameLength && enhanced.turns.every((turn, idx) => turn.speaker === script.turns[idx]?.speaker);
//         if (!sameLength || !sameSpeakers) {
//           throw new Error('Dialogue enhancement altered speaker ordering or turn count');
//         }

//         return enhanced;
//       } catch (error) {
//         if (error instanceof LlmProviderInvalidJsonError && attempt < maxAttempts) {
//           const snippet = this.truncateForLogs(content);
//           this.logger.warn(
//             `${this.providerLabel} returned invalid JSON for dialogue enhancement (attempt ${attempt}/${maxAttempts}). Response snippet: ${snippet}`,
//           );
//           continue;
//         }
//         throw error;
//       }
//     }
//     throw new LlmProviderInvalidJsonError(this.providerLabel, 'dialogue enhancement', '');
//   }

  async generateEpisodeMetadata(script: string, segments: EpisodeSegment[]): Promise<EpisodeMetadata> {
    const client = this.getClient();
    const topicsList = segments
      .map((segment, idx) => `${idx + 1}. ${segment.title || 'Untitled topic'}`)
      .join('\n');
    const allSources = this.collectSources(segments);
    const messages = [
      {
        role: 'system',
        content: `You generate concise podcast metadata: a short, high-signal title, a 1-sentence playlist description, and detailed show notes. Respond ONLY as JSON with shape:
{"title": "...", "description": "...", "show_notes": "markdown content"}.

TITLE RULES (strict, domain-neutral)
- Under 8 words.
- Must include at least one concrete, distinguishing detail pulled directly from the script, such as:
  - a named entity (person, place, event, product, organization, etc.)
  - a specific concept uniquely discussed in this episode
  - a quoted phrase or term that appears in the script
  - any episode-specific fact, element, or hook that would not appear in every episode
- Never rely on broad category labels (e.g., “Tech Update,” “Art News,” “Weekly Briefing,” etc.).
- Avoid years or dates as the main hook unless inherently meaningful in the script.
- No filler like “and more,” “insights,” “update,” or similar generic wording.
- Ensure the title uniquely identifies this episode, even when many episodes are generated from similar recurring topics.
- Engaging, factual, no clickbait, no trailing punctuation.

DESCRIPTION RULES
- 8–16 words, plain text only.
- Must reference the same specific distinguishing details used in the title so listeners can easily recognize this episode among others.
- No emojis, markdown, or vague generalizations.

SHOW NOTES RULES
- Output in Markdown format.
- Begin with a single tight 1–2 sentence summary that uses the unique details highlighted in the title/description.
- Follow with an ultra-brief bullet list (3–5 items, max 12 words each) of key moments.
- Do NOT include a Sources section or any URLs; sources are stored and rendered separately.
- Keep the entire notes section under 150 words; favor brevity over detail.`,
      },
      {
        role: 'user',
        content: `Episode script:\n${script}\n\nTopics:\n${topicsList}\n\nSources:\n${allSources}`,
      },
    ] satisfies ChatCompletionMessageParam[];
    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages,
      temperature: 0.55,
      max_tokens: 800,
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`${this.providerLabel} returned empty content for metadata generation`);
    }
    const parsed = this.parseMetadata(content);
    const sanitizedShowNotes = this.removeSourcesFromShowNotes(parsed.showNotes);
    if (!parsed.title || !sanitizedShowNotes) {
      throw new Error(`${this.providerLabel} metadata response missing title or show notes`);
    }
    const description = parsed.description?.trim() || this.deriveDescriptionFromShowNotes(sanitizedShowNotes);
    return { ...parsed, description, showNotes: sanitizedShowNotes };
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getFirstConfigValue(this.apiKeyConfigKeys);
      if (!apiKey) {
        throw new Error(`${this.apiKeyConfigKeys[0]} must be set for LLM provider`);
      }
      const baseURL = this.getFirstConfigValue(this.baseUrlConfigKeys) ?? this.defaultBaseUrl;
      this.client = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
      });
    }
    return this.client;
  }

  private normalizeKeys(primaryList: string[] | undefined, singleKey: string | undefined, fallback: string) {
    const keys = [...(primaryList || [])];
    if (singleKey) {
      keys.push(singleKey);
    }
    keys.push(fallback);
    return Array.from(new Set(keys)).filter(Boolean);
  }

  private getFirstConfigValue(keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (!value) {
        continue;
      }
      const trimmed = value.trim();
      if (/^\$\{[^}]+\}$/.test(trimmed)) {
        continue;
      }
      return trimmed;
    }
    return undefined;
  }

  private collectSources(segments: EpisodeSegment[]): string {
    const seen = new Set<string>();
    const lines = segments
      .flatMap((segment) => segment.rawSources || [])
      .filter((source) => Boolean(source?.url))
      .filter((source) => {
        const key = (source.url || '').toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((source) => `- ${source.sourceTitle || source.url || 'source'} (${source.url})`);

    if (!lines.length) {
      return '- None provided';
    }
    return lines.join('\n');
  }

  private parseTopicIntent(raw: any, fallback: TopicIntent = 'single_story'): TopicIntent {
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'single_story') {
        return 'single_story';
      }
      if (normalized === 'multi_item') {
        return 'multi_item';
      }
    }
    return fallback;
  }

  private normalizeQueries(queries: string[]): string[] {
    const seen = new Set<string>();
    return (queries || [])
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 2)
      .filter((topic) => {
        const key = topic.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private parseTopicQueryPlan(content: string): TopicQueryPlan {
    const normalizedContent = content.trim();
    const jsonCandidate = this.extractJsonBlock(normalizedContent);
    let intent: TopicIntent = 'single_story';
    let queries: string[] = [];

    try {
      const parsed = JSON.parse(jsonCandidate);
      const parsedIntent = (parsed as any)?.intent;
      intent = this.parseTopicIntent(parsedIntent, intent);
      if (Array.isArray((parsed as any)?.queries)) {
        queries = this.normalizeQueries((parsed as any).queries);
      } else if (Array.isArray((parsed as any)?.topics)) {
        queries = this.normalizeQueries((parsed as any).topics);
      }
    } catch {
      // Fallback handled below
    }

    if (!queries.length) {
      queries = this.parseList(normalizedContent);
    }
    intent = this.parseTopicIntent(intent, 'single_story');

    return {
      intent,
      queries: this.normalizeQueries(queries).slice(0, 5),
    };
  }

  private parseSpeaker(raw: any): DialogueTurn['speaker'] | null {
    if (typeof raw !== 'string') {
      return null;
    }
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'SPEAKER_1' || normalized === 'SPEAKER 1' || normalized === 'SPEAKER1') {
      return 'SPEAKER_1';
    }
    if (normalized === 'SPEAKER_2' || normalized === 'SPEAKER 2' || normalized === 'SPEAKER2') {
      return 'SPEAKER_2';
    }
    return null;
  }

  private parseDialogueScript(
    content: string,
    fallbackIntent: TopicIntent,
    fallbackTitle: string,
    options?: { stripAudioTags?: boolean },
  ): SegmentDialogueScript {
    const normalizedContent = content.trim();
    const parsed = this.parseJsonWithFallback(normalizedContent, 'dialogue script');
    const stripAudioTags = options?.stripAudioTags ?? false;

    const intent = this.parseTopicIntent(parsed?.intent, fallbackIntent);
    const title = typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle;
    const rawTurns = Array.isArray(parsed?.turns) ? parsed.turns : [];

    const turns: DialogueTurn[] = rawTurns
      .map((turn: any) => {
        const speaker = this.parseSpeaker(turn?.speaker);
        const text = this.sanitizeDialogueText(turn?.text, { stripAudioTags });
        if (!speaker || !text) {
          return null;
        }
        return { speaker, text };
      })
      .filter((turn: DialogueTurn | null): turn is DialogueTurn => Boolean(turn));

    if (!turns.length) {
      throw new Error(`${this.providerLabel} did not return any dialogue turns`);
    }

    const sanitizedTurns = turns.filter((turn) => turn.text.length > 0);
    if (!sanitizedTurns.length) {
      throw new Error(`${this.providerLabel} did not return any dialogue text`);
    }
    const speakerCounts = sanitizedTurns.reduce((acc, turn) => {
      acc[turn.speaker] = (acc[turn.speaker] || 0) + 1;
      return acc;
    }, {} as Record<DialogueTurn['speaker'], number>);
    const totalTurns = sanitizedTurns.length;
    const dominantSpeakerCount = Math.max(...Object.values(speakerCounts), 0);
    const speakerBalanceOk = dominantSpeakerCount / totalTurns <= 0.7;

    return {
      title,
      intent,
      turns: speakerBalanceOk ? sanitizedTurns : sanitizedTurns,
    };
  }

  private sanitizeDialogueText(text: any, options?: { stripAudioTags?: boolean }): string {
    if (typeof text !== 'string') {
      return '';
    }
    const withoutSpeakerLabels = text
      .replace(/\bSPEAKER[_ ]?1\b:?/gi, '')
      .replace(/\bSPEAKER[_ ]?2\b:?/gi, '')
      .trim();
    const withoutAudioTags = options?.stripAudioTags
      ? this.stripAudioDirectionTags(withoutSpeakerLabels)
      : withoutSpeakerLabels;
    return withoutAudioTags.replace(/\s{2,}/g, ' ').trim();
  }

  private stripAudioDirectionTags(text: string): string {
    return text.replace(/\s*\[[^\]\n]{1,40}\]\s*/g, ' ');
  }

  private truncateForLogs(value: string | undefined, maxLength = 400): string {
    if (!value) {
      return '';
    }
    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return '';
    }
    return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}…`;
  }

  private isRetryableLlmError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const err = error as any;
    const status = err?.status ?? err?.response?.status;
    if (typeof status === 'number' && [429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
    const code = err?.code ?? err?.cause?.code;
    if (typeof code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)) {
      return true;
    }
    const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
    if (!message) {
      return false;
    }
    return message.includes('socket hang up') || message.includes('timeout') || message.includes('timed out');
  }

  private parseList(content: string): string[] {
    const normalizedContent = content.trim();
    let topics: string[] = [];
    try {
      const parsed = JSON.parse(normalizedContent);
      if (Array.isArray(parsed)) {
        topics = parsed;
      } else if (parsed) {
        const parsedObj = parsed as any;
        if (Array.isArray(parsedObj.topics)) {
          topics = parsedObj.topics;
        } else if (Array.isArray(parsedObj.queries)) {
          topics = parsedObj.queries;
        }
      }
    } catch {
      // Fallback handled below
    }

    if (!topics.length) {
      topics = normalizedContent.split(/\n|,/).map((t) => t.trim()).filter(Boolean);
    }

    const seen = new Set<string>();
    return topics
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 2)
      .filter((topic) => {
        const key = topic.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  private parseMotif(content: string): string | null {
    const normalized = content.trim();
    const jsonCandidate = this.extractJsonBlock(normalized);
    const parsedFromJson = this.parseMotifJson(jsonCandidate);
    if (parsedFromJson) {
      return parsedFromJson;
    }
    const cleaned = normalized.replace(/^(motif|subject)[:\s-]+/i, '').trim();
    const sanitized = this.sanitizeMotif(cleaned);
    return sanitized || null;
  }

  private parseMotifJson(raw: string): string | null {
    try {
      const parsed = JSON.parse(raw);
      const motif = this.sanitizeMotif((parsed as any)?.motif || (parsed as any)?.idea || (parsed as any)?.subject);
      return motif || null;
    } catch {
      return null;
    }
  }

  private sanitizeMotif(raw: unknown): string {
    if (typeof raw !== 'string') {
      return '';
    }
    const withoutLabels = raw.replace(/^(motif|idea|subject)[:\s-]+/i, '').trim();
    const collapsed = withoutLabels.replace(/\s+/g, ' ').replace(/[."']+$/g, '').trim();
    const words = collapsed.split(' ').filter(Boolean).slice(0, 12);
    return words.join(' ');
  }

  private parseMetadata(content: string): EpisodeMetadata {
    const fallback: EpisodeMetadata = { title: '', showNotes: '', description: '' };
    const normalized = content.trim();
    if (!normalized) {
      return fallback;
    }

    const jsonCandidate = this.extractJsonBlock(normalized);
    const parsedFromJson = this.parseMetadataJson(jsonCandidate);
    if (parsedFromJson.title && parsedFromJson.showNotes) {
      return parsedFromJson;
    }

    const parsedFromLabels = this.parseMetadataLabels(normalized);
    if (parsedFromLabels.title && parsedFromLabels.showNotes) {
      return parsedFromLabels;
    }

    return fallback;
  }

  private extractJsonBlock(content: string): string {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }
    return content;
  }

  private extractFirstJsonObject(content: string): string | null {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return content.slice(firstBrace, lastBrace + 1).trim();
    }
    return null;
  }

  private extractBalancedJsonObject(content: string): string | null {
    const start = content.indexOf('{');
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index += 1) {
      const char = content[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return content.slice(start, index + 1).trim();
        }
      }
    }

    return null;
  }

  private repairJsonCandidate(raw: string): string {
    const cleaned = (raw || '')
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();

    const escapedNewlines: string[] = [];
    let inString = false;
    let escaped = false;

    for (let index = 0; index < cleaned.length; index += 1) {
      const char = cleaned[index];

      if (inString) {
        if (escaped) {
          escaped = false;
          escapedNewlines.push(char);
          continue;
        }

        if (char === '\\') {
          escaped = true;
          escapedNewlines.push(char);
          continue;
        }

        if (char === '"') {
          inString = false;
          escapedNewlines.push(char);
          continue;
        }

        if (char === '\n') {
          escapedNewlines.push('\\n');
          continue;
        }

        if (char === '\r') {
          escapedNewlines.push('\\r');
          continue;
        }

        escapedNewlines.push(char);
        continue;
      }

      if (char === '"') {
        inString = true;
      }
      escapedNewlines.push(char);
    }

    return escapedNewlines.join('').replace(/,\s*([}\]])/g, '$1').trim();
  }

  private parseJsonWithFallback(raw: string, contextLabel: string): any {
    const cleaned = (raw || '').replace(/\u0000/g, '').trim();
    const candidates: Array<string | null> = [
      this.extractJsonBlock(cleaned),
      this.extractBalancedJsonObject(cleaned),
      this.extractFirstJsonObject(cleaned),
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      try {
        return JSON.parse(candidate);
      } catch {
        const repaired = this.repairJsonCandidate(candidate);
        try {
          return JSON.parse(repaired);
        } catch {
          // try next candidate
        }
      }
    }

    throw new LlmProviderInvalidJsonError(this.providerLabel, contextLabel, cleaned);
  }

  private parseMetadataJson(raw: string): EpisodeMetadata {
    const fallback: EpisodeMetadata = { title: '', showNotes: '', description: '' };
    try {
      const parsed = JSON.parse(raw.trim());
      const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
      const showNotes =
        typeof parsed.show_notes === 'string'
          ? parsed.show_notes.trim()
          : typeof parsed.showNotes === 'string'
              ? parsed.showNotes.trim()
              : '';
      const description =
        typeof parsed.description === 'string'
          ? parsed.description.trim()
          : typeof parsed.episode_description === 'string'
              ? parsed.episode_description.trim()
              : typeof parsed.short_description === 'string'
                  ? parsed.short_description.trim()
                  : '';
      return { title, showNotes, description };
    } catch {
      return fallback;
    }
  }

  private parseMetadataLabels(content: string): EpisodeMetadata {
    const buffers: Record<'title' | 'showNotes' | 'description', string[]> = {
      title: [],
      showNotes: [],
      description: [],
    };
    let current: keyof typeof buffers | null = null;

    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const match = line.match(/^(title|show[\s_-]*notes?|description)[:\s-]+(.*)$/i);
      if (match) {
        const label = match[1].toLowerCase();
        current = label.startsWith('title')
          ? 'title'
          : label.startsWith('show')
              ? 'showNotes'
              : 'description';
        const remainder = (match[2] || '').trim();
        if (remainder && current) {
          buffers[current].push(remainder);
        }
        continue;
      }

      if (current) {
        buffers[current].push(line);
      }
    }

    return {
      title: buffers.title.join('\n').trim(),
      showNotes: buffers.showNotes.join('\n').trim(),
      description: buffers.description.join('\n').trim(),
    };
  }

  private deriveDescriptionFromShowNotes(showNotes: string): string {
    const sanitizedLines = (showNotes || '')
      .replace(/\*\*|__|`/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.toLowerCase().startsWith('sources'));

    if (!sanitizedLines.length) {
      return 'Personalized Briefly episode';
    }

    const firstSentence = sanitizedLines[0].split(/(?<=[.!?])\s+/)[0].trim();
    if (!firstSentence) {
      return 'Personalized Briefly episode';
    }
    if (firstSentence.length > 140) {
      return `${firstSentence.slice(0, 137)}...`;
    }
    return firstSentence;
  }

  private removeSourcesFromShowNotes(showNotes: string): string {
    if (typeof showNotes !== 'string') {
      return '';
    }

    const lines = showNotes.split('\n');
    const headingIndex = lines.findIndex((line) =>
      /^\s{0,3}(?:#{1,6}\s*)?sources\b[:]?/i.test(line.trim()),
    );
    const truncated = headingIndex >= 0 ? lines.slice(0, headingIndex) : lines;

    // Drop trailing blank lines that may precede a removed Sources section.
    while (truncated.length && truncated[truncated.length - 1].trim() === '') {
      truncated.pop();
    }

    const withoutSources = truncated.join('\n');
    const withoutLinks = withoutSources
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1') // strip markdown links
      .replace(/https?:\/\/\S+/gi, ''); // strip bare URLs

    return withoutLinks.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
}

class LlmProviderInvalidJsonError extends Error {
  constructor(providerLabel: string, contextLabel: string, public readonly rawContent: string) {
    super(`${providerLabel} returned invalid JSON for ${contextLabel}`);
    this.name = 'LlmProviderInvalidJsonError';
  }
}
