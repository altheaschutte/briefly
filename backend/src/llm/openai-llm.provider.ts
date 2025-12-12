import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LlmProvider, ScriptGenerationResult } from './llm.provider';
import { EpisodeSegment, EpisodeSource } from '../domain/types';

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private client: OpenAI | null = null;
  private readonly rewriteModel: string;
  private readonly scriptModel: string;

  constructor(private readonly configService: ConfigService) {
    this.rewriteModel = this.configService.get<string>('LLM_PROVIDER_REWRITE_MODEL') ?? 'gpt-4.1';
    this.scriptModel = this.configService.get<string>('LLM_PROVIDER_SCRIPT_MODEL') ?? 'gpt-4.1';
  }

  async rewriteTopic(topic: string): Promise<string> {
    const client = this.getClient();
    const isoDate = new Date().toISOString().split('T')[0];
    const messages = [
      {
        role: 'system',
        content:
          `You rewrite user topic requests into up-to-date search queries for Perplexity-style retrieval.
Current date: ${isoDate} (UTC). This feeds a daily episode, so prioritize recency and fresh angles.
If a previous episode transcript appears in the user message, avoid repeat coverage and steer toward new developments.
Guidelines:
- Anchor queries to the current date with explicit timeframes (e.g., past week, ${isoDate}, 2025) when the user is vague.
- Emphasize current events, breaking changes, and what is new; avoid stale results unless the user asks for history.
- Add disambiguation (location, entity, domain) to reduce ambiguity while keeping tokens tight.
- Do not invent facts, dates, or names; keep it factual and concise.
Return only the rewritten query.`,
      },
      { role: 'user', content: topic },
    ] satisfies ChatCompletionMessageParam[];
    const response = await client.chat.completions.create({
      model: this.rewriteModel,
      messages,
      temperature: 0.3,
      max_tokens: 128,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for topic rewrite');
    }
    return content.trim();
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
}
