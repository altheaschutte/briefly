import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PerplexityResult {
  answer: string;
  citations: string[];
  citationMetadata: PerplexityCitation[];
}

export interface PerplexityCitation {
  url: string;
  title?: string;
  source?: string;
}

@Injectable()
export class PerplexityService {
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    // Use a permitted model; see https://docs.perplexity.ai/getting-started/models
    this.model = this.configService.get<string>('PERPLEXITY_MODEL') ?? 'sonar';
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
    const citationMetadata = this.parseCitations(response.data?.citations);
    const citations: string[] = citationMetadata.map((citation) => citation.url);
    return { answer, citations, citationMetadata };
  }

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing required env var: ${key}`);
    }
    return value;
  }

  private parseCitations(raw: unknown): PerplexityCitation[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const parsed: PerplexityCitation[] = [];

    for (const item of raw) {
      if (!item) continue;

      if (typeof item === 'string') {
        const url = item.trim();
        if (url) {
          parsed.push({ url, title: this.humanizeUrl(url) });
        }
        continue;
      }

      if (typeof item === 'object') {
        const citation = this.normalizeCitationObject(item as Record<string, unknown>);
        if (citation) {
          parsed.push(citation);
        }
      }
    }

    return parsed;
  }

  private normalizeCitationObject(candidate: Record<string, unknown>): PerplexityCitation | null {
    const url =
      this.safeString(candidate['url']) ||
      this.safeString(candidate['link']) ||
      this.safeString(candidate['href']) ||
      this.safeString(candidate['source']) ||
      this.safeString(candidate['citation']);

    if (!url) {
      return null;
    }

    const title =
      this.safeString(candidate['title']) ||
      this.safeString(candidate['text']) ||
      this.safeString(candidate['label']) ||
      this.safeString(candidate['name']) ||
      this.safeString(candidate['description']) ||
      this.safeString(candidate['snippet']) ||
      this.safeString((candidate['metadata'] as Record<string, unknown> | undefined)?.['title']);

    const source =
      this.safeString(candidate['source']) ||
      this.safeString((candidate['metadata'] as Record<string, unknown> | undefined)?.['source']);

    return {
      url,
      title: title || this.humanizeUrl(url),
      source: source || undefined,
    };
  }

  private safeString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }
    return null;
  }

  private humanizeUrl(raw: string): string {
    try {
      const parsed = new URL(raw);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return raw;
    }
  }
}
