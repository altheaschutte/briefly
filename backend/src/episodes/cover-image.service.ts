import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import crypto from 'crypto';
import { EpisodeSegment } from '../domain/types';
import { StorageService } from '../storage/storage.service';
import { LlmService } from '../llm/llm.service';
import { LlmUsageService } from '../llm-usage/llm-usage.service';
import { estimateImageCostUsd } from '../llm-usage/image-pricing';

@Injectable()
export class CoverImageService {
  private readonly logger = new Logger(CoverImageService.name);
  private client: OpenAI | null = null;
  private readonly fallbackMotifs = ['interlocking waves', 'orbiting rings'];
  private readonly provider: ProviderName;
  private readonly apiKeyConfigKeys: string[];
  private readonly baseUrlConfigKeys: string[];
  private readonly modelConfigKeys: string[];

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly llmService: LlmService,
    private readonly llmUsageService: LlmUsageService,
  ) {
    this.provider = resolveImageProvider(configService.get<string>('COVER_IMAGE_PROVIDER') ?? 'openai');
    this.apiKeyConfigKeys =
      this.provider === 'openai'
        ? ['COVER_IMAGE_OPENAI_API_KEY', 'OPENAI_API_KEY']
        : ['COVER_IMAGE_XAI_API_KEY', 'XAI_API_KEY'];
    this.baseUrlConfigKeys =
      this.provider === 'openai'
        ? ['COVER_IMAGE_OPENAI_BASE_URL', 'OPENAI_BASE_URL']
        : ['COVER_IMAGE_XAI_BASE_URL', 'XAI_BASE_URL'];
    this.modelConfigKeys =
      this.provider === 'openai'
        ? ['COVER_IMAGE_OPENAI_MODEL', 'COVER_IMAGE_MODEL', 'OPENAI_IMAGE_MODEL']
        : ['COVER_IMAGE_XAI_MODEL', 'COVER_IMAGE_MODEL', 'XAI_IMAGE_MODEL'];
  }

  async buildPrompt(title?: string, segments: EpisodeSegment[] = []): Promise<string> {
    const STYLE =
      'Modern editorial podcast cover. Matte texture, pastel palette, clean flat shapes. ' +
      'Briefly colors (midnight #132a3b, slate #1f3a4e, apricot #ffa563, teals #2a7997/#37a8ae/#93c8c2). ' +
      'Minimal, calm. Full-bleed; no borders or drop shadows. No text/logos/watermarks. Avoid photorealism. ';

    const hero = this.pickHeroSegment(segments);
    const heroText = [title, hero?.title].filter(Boolean).join(' — ');
    const visualStyle = this.motifFromText(heroText || title || '');
    const motif = await this.buildMotif(title, segments);
    const motifLine =
      `Motif: single-line drawing of ${motif}; simple geom backdrop; subtle texture; 3–5 colors; no text/faces. `;

    const prompt =
      STYLE +
      motifLine +
      `Color palette: ${visualStyle.palette}. ` +
      `Composition: ${visualStyle.composition}. ` +
      'Stylized, flat shapes, gentle gradients, subtle texture. Cohesive, not busy.';

    return prompt.trim();
  }

  getProvider(): ProviderName {
    return this.provider;
  }

  async generateCoverImage(
    userId: string,
    episodeId: string,
    prompt: string,
  ): Promise<{ imageUrl: string; storageKey: string }> {
    const client = this.getClient();
    const model =
      this.getFirstConfigValue(this.modelConfigKeys) ||
      (this.provider === 'xai' ? 'grok-image-1' : 'gpt-image-1');
    const supportsGptImageParams =
      this.provider !== 'xai' && typeof model === 'string' && model.toLowerCase().includes('gpt-image-1');
    const request: Parameters<OpenAI['images']['generate']>[0] = {
      model,
      prompt,
      n: 1,
    };
    // xAI image generation does not support the OpenAI-style size parameter
    if (this.provider !== 'xai') {
      request.size = '1024x1024';
      if (supportsGptImageParams) {
        request.output_format = 'jpeg';
        request.output_compression = 80;
        request.quality = 'high';
      }
    }
    const response = await client.images.generate(request);
    try {
      const costUsd = estimateImageCostUsd({
        model: String(model),
        count: 1,
        size: (request as any).size,
        quality: (request as any).quality,
      });
      await this.llmUsageService.record({
        operation: 'image.generateCoverImage',
        provider: this.provider === 'xai' ? 'xAI Images' : 'OpenAI Images',
        model: String(model),
        usage: { raw: { request: { ...request }, response: { created: (response as any)?.created } } },
        costUsd,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record image generation cost for episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const first = response.data?.[0] as any;
    const imageBase64: string | undefined = first?.b64_json || first?.b64Json;
    if (!imageBase64) {
      throw new Error('OpenAI returned an empty image payload for cover generation');
    }
    const buffer = Buffer.from(imageBase64, 'base64');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const { ext, contentType } = this.detectImageFormat(buffer);
    const key = `images/${userId}/${episodeId}-${hash}.${ext}`;
    const upload = await this.storageService.uploadImage(buffer, key, {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    return { imageUrl: upload.url, storageKey: upload.key };
  }

  private detectImageFormat(buffer: Buffer): { ext: 'png' | 'jpg' | 'webp'; contentType: string } {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { ext: 'png', contentType: 'image/png' };
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return { ext: 'jpg', contentType: 'image/jpeg' };
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return { ext: 'webp', contentType: 'image/webp' };
    }
    return { ext: 'png', contentType: 'image/png' };
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getFirstConfigValue(this.apiKeyConfigKeys);
      if (!apiKey) {
        throw new Error(`${this.apiKeyConfigKeys[0]} must be set for cover image generation`);
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: this.getFirstConfigValue(this.baseUrlConfigKeys) || undefined,
      });
    }
    return this.client;
  }

  private getFirstConfigValue(keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (!value) {
        continue;
      }
      const trimmed = value.trim();
      // Skip unresolved placeholders like ${XAI_API_KEY}
      if (/^\$\{[^}]+\}$/.test(trimmed)) {
        continue;
      }
      return trimmed;
    }
    return undefined;
  }

  private async buildMotif(title?: string, segments: EpisodeSegment[] = []): Promise<string> {
    const topics = this.pickMotifTopics(segments);
    const baseTitle = title || 'Untitled episode';
    try {
      const motif = await this.llmService.generateCoverMotif(baseTitle, topics);
      const validated = this.validateMotif(motif);
      if (validated) {
        return validated;
      }
      this.logger.warn(`Discarding unsafe motif "${motif}"; using fallback.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cover motif generation failed for "${baseTitle}": ${message}`);
    }
    return this.pickFallbackMotif(baseTitle);
  }

  private validateMotif(motif: unknown): string | null {
    if (typeof motif !== 'string') {
      return null;
    }
    const sanitized = motif.replace(/\s+/g, ' ').replace(/[."']+$/g, '').trim();
    if (!sanitized) {
      return null;
    }
    const words = sanitized.split(' ').filter(Boolean);
    if (!words.length) {
      return null;
    }
    const limited = words.slice(0, 12).join(' ');
    if (/\btext\b|\bletter\b|\bletters\b|\bwords?\b/.test(limited.toLowerCase())) {
      return null;
    }
    if (/\d/.test(limited)) {
      return null;
    }
    return limited;
  }

  private pickFallbackMotif(seed?: string): string {
    const hashes = (seed || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const index = this.fallbackMotifs.length ? hashes % this.fallbackMotifs.length : 0;
    return this.fallbackMotifs[index] || 'interlocking waves';
  }

  private pickMotifTopics(segments: EpisodeSegment[]): string[] {
    return [...(segments || [])]
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map((segment) => segment.title?.trim())
      .filter((title): title is string => Boolean(title))
      .slice(0, 2);
  }

  private pickHeroSegment(segments: EpisodeSegment[]): EpisodeSegment | undefined {
    if (!segments?.length) {
      return undefined;
    }
    return segments[0];
  }

  private motifFromText(text: string) {
    const t = (text || '').toLowerCase();
// WEEKEND / LIFESTYLE / LEISURE
if (t.match(/weekend|lifestyle|leisure|relax|downtime/)) {
  return {
    subject:
      "a simplified car with a surfboard on the roof, or a martini glass silhouette, or kids bicycles with helmets",
    palette:
      "midnight blue base (#132a3b) with pastel apricot (#ffa563), soft teal mist (#93c8c2), and sandy beige highlights",
    composition:
      "playful poster-style layout with floating objects and generous negative space",
  };
}

// HIKING / OUTDOORS / NATURE
if (t.match(/hike|hiking|trail|outdoors|nature|walk|forest|mountain/)) {
  return {
    subject:
      "minimal hiking boots, winding trail lines, rolling hills, or layered mountains",
    palette:
      "deep forest teal (#2a7997), softened moss, warm stone, and pale sky blue over a midnight #132a3b backdrop",
    composition:
      "layered landscape composition with depth and gentle vertical rhythm",
  };
}

// LOCAL EVENTS / WHAT'S ON
if (t.match(/local events|what's on|nearby|community|festival|market|gig/)) {
  return {
    subject:
      "map pin or location arrow combined with simple walking shoes, bicycle, or venue outline",
    palette:
      "teal spotlight (#37a8ae) with warm sand, midnight edges (#132a3b), and soft off-white notes",
    composition:
      "collage-style layout with icon layered over abstract map shapes",
  };
}

// NEWS / CURRENT EVENTS
if (t.match(/news|breaking|headline|update|current events|today/)) {
  return {
    subject:
      "simplified world map or local map with broadcast symbols like a microphone, radio waves, or megaphone",
    palette:
      "slate #1f3a4e with mist teal (#93c8c2), a small apricot signal (#ffa563), and cream",
    composition:
      "balanced editorial layout with central map form and radiating signal lines",
  };
}

// JOURNALISM / MEDIA / BROADCAST
if (t.match(/media|journalism|press|broadcast|radio|podcast/)) {
  return {
    subject:
      "vintage microphone, radio dial, newspaper blocks, or camera silhouette",
    palette:
      "inked slate (#1f3a4e) with warm beige, pastel apricot (#ffa563) details, and off-white",
    composition:
      "clean poster layout with strong central object and subtle texture",
  };
}

// TECH / AI / AUTOMATION (expanded)
if (t.match(/ai|artificial intelligence|machine learning|automation|robot|neural|algorithm/)) {
  return {
    subject:
      "robotic arm, abstract neural network nodes, flowing data lines, or modular automation shapes",
    palette:
      "midnight base (#132a3b) with pastel teal gradients (#37a8ae, #93c8c2), apricot sparks (#ffa563), and fog gray",
    composition:
      "asymmetrical tech collage with layered geometry and connecting lines",
  };
}

// STARTUPS / BUSINESS / PRODUCT
if (t.match(/startup|business|product|founder|growth|strategy|marketing/)) {
  return {
    subject:
      "abstract building blocks, upward paths, roadmap shapes, or stacked panels",
    palette:
      "slate navy (#1f3a4e) with apricot highlight (#ffa563), muted teal (#2a7997), and soft cream",
    composition:
      "structured layout with clear directional flow suggesting progress",
  };
}

// FINANCE / MONEY (expanded)
if (t.match(/finance|markets|stocks|investing|money|inflation|rates|economy/)) {
  return {
    subject:
      "minimal charts, rising curves, coins abstracted into circles, or layered financial graphs",
    palette:
      "ink blue base (#132a3b) with muted emerald, apricot-gold (#ffa563), and soft teal gray (#93c8c2)",
    composition:
      "diagonal or upward movement with layered bands suggesting momentum",
  };
}

// FOOD / DRINK
if (t.match(/food|drink|recipe|cooking|dinner|restaurant|coffee|wine|cocktail/)) {
  return {
    subject:
      "stylized plate, cup, wine glass, bottle, or simple ingredients arranged abstractly",
    palette:
      "apricot sorbet (#ffa563) with herbal olive, teal glass highlights (#37a8ae), and creamy white",
    composition:
      "top-down or centered composition with balanced spacing like a menu illustration",
  };
}

// HEALTH / WELLNESS / FITNESS
if (t.match(/health|fitness|exercise|yoga|sleep|nutrition|wellness/)) {
  return {
    subject:
      "calm human silhouette, stretching figure, heart line, or flowing breath shapes",
    palette:
      "soft teal breath (#93c8c2) with sage, warm sand, and a midnight #132a3b base",
    composition:
      "centered, symmetrical layout with slow flowing curves",
  };
}

// EDUCATION / LEARNING / EXPLAINERS
if (t.match(/learn|education|explain|how to|guide|lesson|history/)) {
  return {
    subject:
      "open book, layered paper sheets, timeline bands, or abstract knowledge paths",
    palette:
      "muted teal (#2a7997) and apricot ochre (#ffa563) with soft gray and cream on a midnight wash (#132a3b)",
    composition:
      "horizontal progression or layered stacks suggesting learning flow",
  };
}

// DEFAULT FALLBACK
  return {
    subject:
      "organic abstract shapes with a single expressive line-art gesture overlay",
    palette:
      "choose pastel takes on the Briefly palette (#132a3b, #1f3a4e, #ffa563, #2a7997, #37a8ae, #93c8c2) with one complementary accent and off-white",
    composition:
      "asymmetrical layout with one dominant shape and supporting secondary forms",
};
  }
}

type ProviderName = 'openai' | 'xai';

function resolveImageProvider(raw: string): ProviderName {
  const normalized = (raw || '').toLowerCase();
  if (normalized === 'openai') {
    return 'openai';
  }
  if (normalized === 'xai' || normalized === 'grok') {
    return 'xai';
  }
  throw new Error(`Unsupported cover image provider: ${raw}`);
}
