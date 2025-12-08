import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { LlmProvider, ScriptGenerationResult } from './llm.provider';

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  private client: OpenAI | null = null;
  private readonly rewriteModel: string;
  private readonly scriptModel: string;

  constructor(private readonly configService: ConfigService) {
    this.rewriteModel = this.configService.get<string>('LLM_PROVIDER_REWRITE_MODEL') ?? 'gpt-4.1-mini';
    this.scriptModel = this.configService.get<string>('LLM_PROVIDER_SCRIPT_MODEL') ?? 'gpt-4.1';
  }

  async rewriteTopic(topic: string): Promise<string> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: this.rewriteModel,
      messages: [
        {
          role: 'system',
          content:
            `Rewrite the user's topic as a search query optimized for Perplexity-style retrieval.
Prioritize: temporal accuracy, location specificity, domain clarity, and minimal tokens.
Transform vague requests into concrete query language without adding new facts.
Return only the query.`,
        },
        { role: 'user', content: topic },
      ],
      temperature: 0.3,
      max_tokens: 128,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for topic rewrite');
    }
    return content.trim();
  }

  async generateScript(segments: any[], targetDurationMinutes?: number): Promise<ScriptGenerationResult> {
    const topicsList = segments
      .map((segment, idx) => `${idx + 1}. ${segment.title || 'Untitled topic'}`)
      .join('\n');

    const context = segments
      .map((segment, idx) => {
        const sources = Array.isArray(segment.rawSources) ? segment.rawSources : [segment.rawSources];
        const sourceList = sources
          .filter(Boolean)
          .map((s: any) => `- ${s.title || s.url || 'source'} (${s.url || 'unknown'})`)
          .join('\n');
        return `Segment ${idx + 1}:\nOriginal topic: ${segment.title || 'Untitled'}\nAI search answer: ${
          segment.rawContent
        }\nSources:\n${sourceList}`;
      })
      .join('\n\n');

    const durationLabel = targetDurationMinutes ? `${targetDurationMinutes}-minute` : 'about 20 minute';

    const client = this.getClient();
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You write a single-host narrative script optimized for ElevenLabs Text-to-Speech v3 (alpha).
- Keep it ${durationLabel}, concise, and engaging with a clear arc (intro, body, outro).
- Follow ElevenLabs TTS best practices: short sentences, clean punctuation for pacing, blank lines for pauses, and no markdown.
- Spell out numbers, dates, currencies, and URLs; avoid emojis or symbols that TTS might misread.
- Add brief pronunciation hints in parentheses for tricky names; keep everything in one voice.
- Use short, relevant audio tags in square brackets (e.g. [pause], [excited], [whispers]) sparingly when they improve delivery.
- Stay under 5,000 characters to fit the Eleven v3 character limit.
- Lightly acknowledge sources inline where relevant.
Return only the final script as plain text.`,
      },
      {
        role: 'user',
        content: `Original user topics:\n${topicsList}\n\nAI search findings to ground the script:\n${context}\n\nWrite the final single-host script for ElevenLabs TTS v3 (alpha) using the above.`,
      },
    ];
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
    return { script: content.trim(), prompt };
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
}
