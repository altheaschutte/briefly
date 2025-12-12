import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EpisodeSegment } from '../domain/types';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CoverImageService {
  private readonly logger = new Logger(CoverImageService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  buildPrompt(title?: string, segments: EpisodeSegment[] = []): string {
    const basePrompt =
      'Abstract editorial illustration in a modern organic style. ' +
      'Soft layered shapes with flowing curves and gentle overlaps. ' +
      'Muted earth-tone palette (sage green, olive, warm beige, clay, off-white). ' +
      'Subtle paper or gouache texture, matte finish. ' +
      'Minimalist, calm, contemporary. ' +
      'No text, no people, no faces, no realistic objects. ' +
      'No sharp edges, no high contrast. ' +
      'Podcast cover artwork.';
    const tagline = this.buildTagline(title, segments);
    return `${basePrompt} ${tagline}`.trim();
  }

  async generateCoverImage(
    userId: string,
    episodeId: string,
    prompt: string,
  ): Promise<{ imageUrl: string; storageKey: string }> {
    const client = this.getClient();
    const model = this.configService.get<string>('OPENAI_IMAGE_MODEL') || 'gpt-image-1';
    const response = await client.images.generate({
      model,
      prompt,
      n: 1,
      size: '1024x1024',
    });
    const first = response.data?.[0] as any;
    const imageBase64: string | undefined = first?.b64_json || first?.b64Json;
    if (!imageBase64) {
      throw new Error('OpenAI returned an empty image payload for cover generation');
    }
    const buffer = Buffer.from(imageBase64, 'base64');
    const key = `images/${userId}/${episodeId}.png`;
    const upload = await this.storageService.uploadImage(buffer, key);
    return { imageUrl: upload.url, storageKey: upload.key };
  }

  private buildTagline(title?: string, segments: EpisodeSegment[] = []): string {
    const trimmedTitle = title?.trim();
    const topicTitles = (segments || [])
      .map((segment) => segment.title?.trim())
      .filter((t): t is string => Boolean(t))
      .map((t) => t || '')
      .filter((t) => t.length > 0);
    const uniqueTopics: string[] = [];
    for (const topic of topicTitles) {
      const key = topic.toLowerCase();
      if (!uniqueTopics.some((existing) => existing.toLowerCase() === key)) {
        uniqueTopics.push(topic);
      }
      if (uniqueTopics.length >= 4) {
        break;
      }
    }

    if (trimmedTitle && uniqueTopics.length) {
      return `Composition inspired by "${trimmedTitle}" and themes of ${uniqueTopics.join(', ')}.`;
    }
    if (trimmedTitle) {
      return `Composition inspired by "${trimmedTitle}" with gently layered themes.`;
    }
    if (uniqueTopics.length) {
      return `Composition inspired by ${uniqueTopics.join(', ')} in softly layered forms.`;
    }
    return 'Composition inspired by layered ideas and gentle convergence.';
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY must be set for cover image generation');
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: this.configService.get<string>('OPENAI_BASE_URL') || undefined,
      });
    }
    return this.client;
  }
}
