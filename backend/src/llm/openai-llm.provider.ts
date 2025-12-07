import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmProvider } from './llm.provider';

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

  async generateScript(segments: any[], targetDurationMinutes?: number): Promise<string> {
    const context = segments
      .map((segment, idx) => {
        const sources = Array.isArray(segment.rawSources) ? segment.rawSources : [segment.rawSources];
        const sourceList = sources
          .filter(Boolean)
          .map((s: any) => `- ${s.title || s.url || 'source'} (${s.url || 'unknown'})`)
          .join('\n');
        return `Segment ${idx + 1}:\nTitle: ${segment.title || 'Untitled'}\nContent: ${segment.rawContent}\nSources:\n${sourceList}`;
      })
      .join('\n\n');

    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: this.scriptModel,
      messages: [
        {
          role: 'system',
          content:
            `You are generating a two-host conversational podcast script. Keep it concise, engaging, and ${
              targetDurationMinutes ? `around ${targetDurationMinutes}-minute` : 'around a 20-minute'
            } listen. Alternate between Host A and Host B. Include brief acknowledgments of sources and ensure clear transitions.`,
        },
        {
          role: 'user',
          content: `Create a podcast script from the following segments:\n${context}`,
        },
      ],
      temperature: 0.65,
      max_tokens: 2048,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content for script generation');
    }
    return content.trim();
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
