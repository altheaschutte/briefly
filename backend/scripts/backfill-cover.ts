import { Logger, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EpisodesService } from '../src/episodes/episodes.service';
import { CoverImageService } from '../src/episodes/cover-image.service';
import { Episode } from '../src/domain/types';

interface CliOptions {
  userId: string;
  episodeId?: string;
  overwrite: boolean;
  includePending: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const idx = argv.indexOf(key);
      if (idx >= 0 && idx < argv.length - 1) {
        return argv[idx + 1];
      }
    }
    return undefined;
  };

  const positional = argv.filter((arg) => !arg.startsWith('-'));
  const userId = get('--user', '-u') || positional[0];
  const episodeId = get('--episode', '-e') || positional[1];
  const overwrite = argv.includes('--overwrite') || argv.includes('-f');
  const includePending = argv.includes('--include-pending');

  if (!userId) {
    throw new Error(
      'Usage: ts-node scripts/backfill-cover.ts --user <userId> [--episode <episodeId>] [--overwrite] [--include-pending]\n' +
        'Positional args also supported: ts-node scripts/backfill-cover.ts <userId> [episodeId]',
    );
  }

  return { userId, episodeId, overwrite, includePending };
}

async function run() {
  const logger = new Logger('BackfillCover');
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const episodesService = app.get(EpisodesService);
    const coverService = app.get(CoverImageService);

    const episodes = await loadEpisodes(episodesService, args, logger);
    logger.log(`Found ${episodes.length} episode(s) to process`);

    for (const episode of episodes) {
      const shouldSkipCover = episode.coverImageUrl && !args.overwrite;
      if (shouldSkipCover) {
        logger.log(`Skipping ${episode.id} (already has cover)`);
        continue;
      }
      const prompt = await coverService.buildPrompt(episode.title, []);
      try {
        logger.log(`Generating cover for episode ${episode.id} using provider ${coverService.getProvider()}`);
        const result = await coverService.generateCoverImage(args.userId, episode.id, prompt);
        await episodesService.updateEpisode(args.userId, episode.id, {
          coverImageUrl: result.imageUrl,
          coverPrompt: prompt,
        });
        logger.log(`Updated episode ${episode.id} with cover ${result.imageUrl}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to generate cover for ${episode.id}: ${message}`);
      }
    }
  } finally {
    await app.close();
  }
}

async function loadEpisodes(episodesService: EpisodesService, args: CliOptions, logger: Logger): Promise<Episode[]> {
  if (args.episodeId) {
    try {
      const episode = await episodesService.getEpisode(args.userId, args.episodeId);
      return args.includePending || episode.status === 'ready' ? [episode] : [];
    } catch (error) {
      if (error instanceof NotFoundException) {
        logger.warn(`Episode ${args.episodeId} not found or archived; skipping`);
        return [];
      }
      throw error;
    }
  }

  const list = await episodesService.listEpisodes(args.userId);
  return list.filter((episode) => args.includePending || episode.status === 'ready');
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
