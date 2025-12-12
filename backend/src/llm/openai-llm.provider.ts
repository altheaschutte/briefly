import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { EpisodeMetadata, LlmProvider, ScriptGenerationResult } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';

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

  async generateTopicQueries(topic: string, previousQueries: string[]): Promise<string[]> {
    const client = this.getClient();
    const isoDate = new Date().toISOString().split('T')[0];
    const history = (previousQueries || []).map((q) => q.trim()).filter(Boolean).slice(-12);
    const historyBlock = history.length ? history.map((q, idx) => `${idx + 1}. ${q}`).join('\n') : 'None';
    const messages = [
      {
        role: 'system',
        content: `You craft high-signal web search queries for a news research agent.
- Suggest between 1 and 5 concise queries per topic; default to 3-5 unless the topic is extremely narrow.
- Prioritize recency (${isoDate}) and angles that surface new developments, exclusives, or authoritative explainers.
- Do not repeat, lightly rephrase, or overlap with any previous queries supplied; aim for fresh coverage.
- Keep each query lean, disambiguated (entities, locations, timeframes), and ready for direct use in a search API.
Respond as JSON with the shape {"queries": ["query one", "query two"]}.`,
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
    const queries = this.parseList(content);
    if (!queries.length) {
      throw new Error('OpenAI did not return any topic queries');
    }
    return queries.slice(0, 5);
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
    targetDurationMinutes?: number,
  ): Promise<string> {
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
        content: `You write a concise, single-host news segment script optimized for ElevenLabs TTS.
- Keep it ${durationLabel} at podcast pace (~150 wpm), clear, and engaging.
- Lead with the key update, add 1-2 tight supporting details, and end with a crisp takeaway.
- Use short sentences, clean punctuation, and blank lines for natural pauses. No markdown.
- Spell out numbers/dates/urls; add quick pronunciation hints for tricky names.
Return only the final segment script as plain text.`,
      },
      {
        role: 'user',
        content: `Segment title: ${title}
Findings to cover:
${findings}

Sources to keep in mind:
${sourceList}`,
      },
    ] satisfies ChatCompletionMessageParam[];

    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages,
      temperature: 0.5,
      max_tokens: 700,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for segment script');
    }
    return content.trim();
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

  async generateScript(
    segments: EpisodeSegment[],
    targetDurationMinutes?: number,
  ): Promise<ScriptGenerationResult> {
    const topicsList = segments
      .map((segment, idx) => `${idx + 1}. ${segment.title || 'Untitled topic'}`)
      .join('\n');

    const context = segments
      .map((segment, idx) => {
        const sources = segment.rawSources || [];
        const sourceList =
          sources
            .filter((s) => Boolean(s))
            .map((s: EpisodeSource) => `- ${s.sourceTitle || s.url || 'source'} (${s.url || 'unknown'})`)
            .join('\n') || '- None provided';
        return `Segment ${idx + 1}:\nOriginal topic: ${segment.title || 'Untitled'}\nAI search answer: ${
          segment.rawContent
        }\nSources:\n${sourceList}`;
      })
      .join('\n\n');

    const durationLabel = targetDurationMinutes ? `${targetDurationMinutes}-minute` : 'about 20 minute';

    const client = this.getClient();
    const messages = [
      {
        role: 'system',
        content: `You write a single-host narrative script optimized for ElevenLabs Text-to-Speech v3 (alpha).
- Keep it ${durationLabel}, concise, conversational, and engaging with a clear arc (intro, body, outro).
- Finish with a tight overall wrap-up that includes 2-3 concise topic suggestions for the next episode.
- Follow ElevenLabs TTS best practices: short sentences, clean punctuation for pacing, blank lines for pauses, and no markdown.
- Spell out numbers, dates, currencies, and URLs; avoid emojis or symbols that TTS might misread.
- Add brief pronunciation hints in parentheses for tricky names; keep everything in one voice.
- Do not include [pause]; use blank lines for pauses instead. Avoid square-bracket audio cues unless explicitly needed for tone (e.g. [excited], [whispers]).
- Skip per-topic outros or wrap-ups; end each segment cleanly and move to the next without filler transitions.
- Stay under 5,000 characters to fit the Eleven v3 character limit.
- Lightly acknowledge sources inline where relevant.
Return only the final script as plain text.`,
      },
      {
        role: 'user',
        content: `Original user topics:\n${topicsList}\n\nAI search findings to ground the script:\n${context}\n\nWrite the final single-host script for ElevenLabs TTS v3 (alpha) using the above.`,
      },
    ] satisfies ChatCompletionMessageParam[];
    const prompt = messages.map((m) => `[${m.role}] ${m.content}`).join('\n\n');
    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages,
      temperature: 0.65,
      max_tokens: 2048,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for script generation');
    }
    const script = content.trim();

    const allSources = this.collectSources(segments);
    const showNotesMessages = [
      {
        role: 'system',
        content:
          'You create concise podcast show notes and episode descriptions. Respond with Markdown only: a 2-3 sentence summary paragraph, a short bullet list of key moments, and a Sources section listing the provided links with human-friendly titles. Keep it factual, do not invent citations, and stay under 400 words.',
      },
      {
        role: 'user',
        content: `Episode script:\n${script}\n\nTopics:\n${topicsList}\n\nSources:\n${allSources}`,
      },
    ] satisfies ChatCompletionMessageParam[];
    const showNotesResponse = await client.chat.completions.create({
      model: this.scriptModel,
      messages: showNotesMessages,
      temperature: 0.55,
      max_tokens: 800,
    });
    const showNotes = showNotesResponse.choices[0]?.message?.content?.trim();
    if (!showNotes) {
      throw new Error('OpenAI returned empty content for show notes generation');
    }

    return { script, prompt, showNotes };
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
