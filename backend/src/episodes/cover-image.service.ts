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
    const STYLE =
      'Premium podcast cover art. Modern editorial illustration. ' +
      'Soft matte finish, subtle paper/gouache texture, pastel tones, clean shapes. ' +
      'Minimalist, calm, contemporary. ' +
      'No text, no logos, no watermarks. Avoid photorealism. ';

    const hero = this.pickHeroSegment(segments);
    const heroText = [title, hero?.title].filter(Boolean).join(' — ');
    const motif = this.motifFromText(heroText || title || '');

    const prompt =
      STYLE +
      `Subject: ${motif.subject}. ` +
      `Color palette: ${motif.palette}. ` +
      `Composition: ${motif.composition}. ` +
      'Keep it stylized, flat shapes, gentle gradients, subtle texture. ' +
      'High quality, cohesive, not busy.';

    return prompt.trim();
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
      "pastel sky blue, sandy beige, soft coral, off-white",
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
      "soft moss green, warm stone, muted clay, pale sky blue",
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
      "pastel teal, warm sand, soft charcoal, off-white",
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
      "cool slate blue, muted red accent, fog gray, cream",
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
      "warm beige, muted ink blue, soft charcoal, off-white",
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
      "pastel indigo, soft mint, fog gray, pale lavender",
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
      "warm terracotta, muted navy, soft cream, pale gold",
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
      "muted emerald, warm gold, slate blue, off-white",
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
      "soft terracotta, olive green, creamy white, muted blush",
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
      "soft sage, misty blue, warm sand, off-white",
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
      "pale ochre, muted teal, soft gray, cream",
    composition:
      "horizontal progression or layered stacks suggesting learning flow",
  };
}

// DEFAULT FALLBACK
return {
  subject:
    "organic abstract shapes with a single expressive line-art gesture overlay",
  palette:
    "choose a coherent pastel palette with two main colors, one accent, and off-white",
  composition:
    "asymmetrical layout with one dominant shape and supporting secondary forms",
};
  }
}
