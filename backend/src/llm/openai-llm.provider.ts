import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { EpisodeMetadata, LlmProvider } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { DialogueTurn, SegmentDialogueScript, TopicIntent, TopicQueryPlan } from './llm.types';

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private client: OpenAI | null = null;
  private readonly queryModel: string;
  private readonly scriptModel: string;
  private readonly transcriptExtractionModel: string;

  constructor(private readonly configService: ConfigService) {
    this.queryModel = this.configService.get<string>('LLM_PROVIDER_REWRITE_MODEL') ?? 'gpt-4.1';
    this.scriptModel = this.configService.get<string>('LLM_PROVIDER_SCRIPT_MODEL') ?? 'gpt-4.1';
    this.transcriptExtractionModel =
      this.configService.get<string>('LLM_PROVIDER_EXTRACTION_MODEL') ?? this.queryModel;
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
- Default to 1 query for "single_story".
- Use 3-5 queries only for "multi_item" topics OR if the topic contains multiple sub-areas that truly require separate queries.
- If "single_story", write ONE query designed to return a single richly detailed result. Add modifiers like: longform, feature, narrative, oral history, investigation, biography.
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
      throw new Error('OpenAI returned empty content for topic queries');
    }
    const plan = this.parseTopicQueryPlan(content);
    if (!plan.queries.length) {
      throw new Error('OpenAI did not return any topic queries');
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
      throw new Error('OpenAI returned empty content for transcript topic extraction');
    }

    const topics = this.parseList(content);
    if (!topics.length) {
      throw new Error('OpenAI did not return any topics from transcript extraction');
    }
    return topics;
  }

  async generateSegmentScript(
    title: string,
    findings: string,
    sources: EpisodeSource[],
    intent: TopicIntent,
    targetDurationMinutes?: number,
  ): Promise<SegmentDialogueScript> {
    const client = this.getClient();
    const durationLabel = targetDurationMinutes ? `${targetDurationMinutes}-minute` : 'about 2 minute';
    const sourceList =
      sources
        .filter((s) => Boolean(s))
        .map((s: EpisodeSource) => `- ${s.sourceTitle || s.url || 'source'} (${s.url || 'unknown'})`)
        .join('\n') || '- None provided';
    const messages = [
      {
        role: 'system',
        content: `You are an expert podcast segment writer. Output a TWO-HOST dialogue for ElevenLabs v3 Dialogue (multi-speaker).

Hosts:
- SPEAKER_1 (Australian male): warm, curious, grounded.
- SPEAKER_2 (British female): sharp, witty, insightful.

Non-negotiable rules:
- Use ONLY the provided Findings. Do not invent facts, names, numbers, dates, or quotes.
- If Findings contain multiple possible stories and intent is "single_story", choose ONE most compelling/most detailed story and ignore the rest.
- No URLs spoken aloud.
- Spell out numbers and dates.
- Keep lines short and speakable. Natural conversational rhythm. No monologues: max 3 turns in a row per speaker.
- Do NOT include speaker names or name cues inside any turn text. Rely on the speaker labels only.
- Avoid excessive audio tags in this draft. Use at most ONE tag per 3 turns on average.
- Tags must be auditory voice cues only, in square brackets, placed immediately before or after the words they color.
  Allowed examples: [thoughtful], [excited], [sighs], [chuckles], [whispers], [short pause], [long pause].
  Do NOT use non-voice stage directions (no [music], [walking], [pacing]) and do NOT wrap entire paragraphs in brackets.

Intent handling:
- "single_story": tell ONE cohesive story only. Structure: Hook → Setup → What happened (chronological) → Why it matters → Memorable close.
- "multi_item": cover up to FOUR distinct updates max. Each update must include: one key fact + one why-it-matters line. Use quick transitions.

Target length:
- Aim for a ${durationLabel} segment at ~150 words per minute total spoken words.

Output JSON only, exactly this shape:
{"title": string, "intent": "single_story"|"multi_item", "turns":[{"speaker":"SPEAKER_1"|"SPEAKER_2","text":string}...]}`,
      },
      {
        role: 'user',
        content: `Intent: ${intent}
Segment title: ${title}
Findings (must-use facts):
${findings}

Sources (for context only):
${sourceList}`,
      },
    ] satisfies ChatCompletionMessageParam[];

    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages,
      temperature: 0.5,
      max_tokens: 1100,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for segment script');
    }
    const script = this.parseDialogueScript(content, intent, title);
    if (script.turns.length < 6) {
      throw new Error('OpenAI returned too few dialogue turns for segment script');
    }
    return script;
  }

  async enhanceSegmentDialogueForElevenV3(script: SegmentDialogueScript): Promise<SegmentDialogueScript> {
    const client = this.getClient();
    const messages = [
      {
        role: 'system',
        content: `You enhance an existing TWO-SPEAKER dialogue for ElevenLabs v3.

Primary goal:
- Improve delivery by inserting concise audio tags in square brackets.

Hard rules:
- DO NOT change, remove, or reorder any words in any turn text.
- You may ONLY insert audio tags (auditory voice cues) and blank lines for pauses.
- Tags must be placed immediately before or after the words they color.
- No non-voice stage directions (no [music], [walking], etc.).
- Do not add speaker names or name cues inside any text.
- Keep tags sparse: typically 1 tag every 2–4 turns, unless the moment clearly benefits.

Return JSON only in the exact same shape:
{"title": string, "intent": "single_story"|"multi_item", "turns":[{"speaker":"SPEAKER_1"|"SPEAKER_2","text":string}...]}`,
      },
      {
        role: 'user',
        content: `Enhance this dialogue by adding sparse delivery tags without changing a single word. Return valid JSON.\n\n${JSON.stringify(script, null, 2)}`,
      },
    ] satisfies ChatCompletionMessageParam[];

    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages,
      temperature: 0.35,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for dialogue enhancement');
    }

    const enhanced = this.parseDialogueScript(content, script.intent, script.title);
    const sameLength = enhanced.turns.length === script.turns.length;
    const sameSpeakers =
      sameLength && enhanced.turns.every((turn, idx) => turn.speaker === script.turns[idx]?.speaker);
    if (!sameLength || !sameSpeakers) {
      throw new Error('Dialogue enhancement altered speaker ordering or turn count');
    }

    return enhanced;
  }

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
- Begin with a 2–3 sentence summary that incorporates the unique details highlighted in the title/description.
- Follow with a short bullet list of key moments from the episode.
- End with a Sources section listing all provided URLs using clean, human-readable link titles.
- Keep the entire notes section under 400 words.`,
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
      throw new Error('OpenAI returned empty content for metadata generation');
    }
    const parsed = this.parseMetadata(content);
    if (!parsed.title || !parsed.showNotes) {
      throw new Error('OpenAI metadata response missing title or show notes');
    }
    const description = parsed.description?.trim() || this.deriveDescriptionFromShowNotes(parsed.showNotes);
    return { ...parsed, description };
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY must be set for OpenAI provider');
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: this.configService.get<string>('OPENAI_BASE_URL') || undefined,
      });
    }
    return this.client;
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

  private parseDialogueScript(content: string, fallbackIntent: TopicIntent, fallbackTitle: string): SegmentDialogueScript {
    const normalizedContent = content.trim();
    const jsonCandidate = this.extractJsonBlock(normalizedContent);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      throw new Error('OpenAI returned invalid JSON for dialogue script');
    }

    const intent = this.parseTopicIntent(parsed?.intent, fallbackIntent);
    const title = typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallbackTitle;
    const rawTurns = Array.isArray(parsed?.turns) ? parsed.turns : [];

    const turns: DialogueTurn[] = rawTurns
      .map((turn: any) => {
        const speaker = this.parseSpeaker(turn?.speaker);
        const text = this.sanitizeDialogueText(turn?.text);
        if (!speaker || !text) {
          return null;
        }
        return { speaker, text };
      })
      .filter((turn: DialogueTurn | null): turn is DialogueTurn => Boolean(turn));

    if (!turns.length) {
      throw new Error('OpenAI did not return any dialogue turns');
    }

    const sanitizedTurns = turns.filter((turn) => turn.text.length > 0);
    if (!sanitizedTurns.length) {
      throw new Error('OpenAI did not return any dialogue text');
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

  private sanitizeDialogueText(text: any): string {
    if (typeof text !== 'string') {
      return '';
    }
    const withoutSpeakerLabels = text
      .replace(/\bSPEAKER[_ ]?1\b:?/gi, '')
      .replace(/\bSPEAKER[_ ]?2\b:?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return withoutSpeakerLabels;
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
}
