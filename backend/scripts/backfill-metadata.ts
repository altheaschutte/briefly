import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EpisodesService } from '../src/episodes/episodes.service';
import { LlmService } from '../src/llm/llm.service';
import { EpisodeSourcesService } from '../src/episodes/episode-sources.service';
import { Episode, EpisodeSegment } from '../src/domain/types';

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
      'Usage: ts-node scripts/backfill-metadata.ts --user <userId> [--episode <episodeId>] [--overwrite] [--include-pending]\n' +
        'Positional args also supported: ts-node scripts/backfill-metadata.ts <userId> [episodeId]',
    );
  }

  return { userId, episodeId, overwrite, includePending };
}

async function run() {
  const logger = new Logger('BackfillMetadata');
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const episodesService = app.get(EpisodesService);
    const llmService = app.get(LlmService);
    const episodeSourcesService = app.get(EpisodeSourcesService);

    const episodes = await loadEpisodes(episodesService, args);
    logger.log(`Found ${episodes.length} episode(s) to process`);

    for (const episode of episodes) {
      const hasMetadata = Boolean(episode.title && episode.showNotes && episode.description);
      if (hasMetadata && !args.overwrite) {
        logger.log(`Skipping ${episode.id} (metadata already present)`);
        continue;
      }

      const transcript = (episode.transcript || '').trim();
      if (!transcript) {
        logger.warn(`Skipping ${episode.id} (no transcript available for metadata generation)`);
        continue;
      }

      const segments = await buildSegments(episode, episodeSourcesService);
      try {
        logger.log(`Regenerating metadata for episode ${episode.id}`);
        const metadata = await llmService.generateEpisodeMetadata(transcript, segments);
        await episodesService.updateEpisode(args.userId, episode.id, {
          title: metadata.title,
          showNotes: metadata.showNotes,
          description: metadata.description,
        });
        logger.log(`Updated episode ${episode.id} metadata`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to regenerate metadata for ${episode.id}: ${message}`);
      }
    }
  } finally {
    await app.close();
  }
}

async function loadEpisodes(episodesService: EpisodesService, args: CliOptions): Promise<Episode[]> {
  if (args.episodeId) {
    const episode = await episodesService.getEpisode(args.userId, args.episodeId);
    return args.includePending || episode.status === 'ready' ? [episode] : [];
  }

  const list = await episodesService.listEpisodes(args.userId);
  return list.filter((episode) => args.includePending || episode.status === 'ready');
}

async function buildSegments(
  episode: Episode,
  episodeSourcesService: EpisodeSourcesService,
): Promise<EpisodeSegment[]> {
  const sources = await episodeSourcesService.listSources(episode.id);
  if (!sources.length) {
    return [];
  }

  return [
    {
      id: 'metadata-backfill',
      episodeId: episode.id,
      orderIndex: 0,
      title: episode.title || 'Episode segment',
      rawContent: episode.transcript || '',
      rawSources: sources,
      script: episode.transcript || '',
    },
  ];
}

run()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .then(() => {
    process.exit(0);
  });
