import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LlmProvider, ScriptGenerationResult } from './llm.provider';
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
      } else if (parsed && Array.isArray((parsed as any).topics)) {
        topics = (parsed as any).topics;
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
}
