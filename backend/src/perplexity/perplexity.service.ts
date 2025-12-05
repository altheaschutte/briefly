import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PerplexityResult {
  answer: string;
  citations: string[];
}

@Injectable()
export class PerplexityService {
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('PERPLEXITY_MODEL') ?? 'sonar-small-chat';
  }

  async search(query: string): Promise<PerplexityResult> {
    const apiKey = this.requireEnv('PERPLEXITY_API_KEY');
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a news researcher returning concise summaries with citations.' },
          { role: 'user', content: query },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const choice = response.data?.choices?.[0];
    const answer: string = choice?.message?.content ?? '';
    const citations: string[] = response.data?.citations ?? [];
    return { answer, citations };
  }

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }
}
