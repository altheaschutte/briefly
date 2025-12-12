import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { EPISODES_REPOSITORY, EpisodesRepository } from '../src/episodes/episodes.repository';

interface CliOptions {
  userId?: string;
  overwrite: boolean;
  dryRun: boolean;
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
  const overwrite = argv.includes('--overwrite') || argv.includes('-f');
  const dryRun = argv.includes('--dry-run');

  return { userId, overwrite, dryRun };
}

function buildSupabaseClient(configService: ConfigService): SupabaseClient {
  const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
  const serviceKey =
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || configService.get<string>('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) must be set');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadUserIds(client: SupabaseClient, userIdOverride?: string): Promise<string[]> {
  if (userIdOverride) {
    return [userIdOverride];
  }

  const { data, error } = await client.from('episodes').select('user_id');
  if (error) {
    throw new Error(`Failed to load users with episodes: ${error.message}`);
  }
  const ids = Array.from(new Set((data || []).map((row: any) => row.user_id).filter(Boolean)));
  return ids as string[];
}

function nextAvailableNumber(used: Set<number>, start: number): number {
  let candidate = Math.max(1, start);
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

async function assignNumbersForUser(
  repository: EpisodesRepository,
  userId: string,
  options: CliOptions,
  logger: Logger,
): Promise<{ updated: number; kept: number; total: number }> {
  const episodes = await repository.listByUser(userId, { includeArchived: true, includeFailed: true });
  if (!episodes.length) {
    logger.log(`No episodes found for user ${userId}`);
    return { updated: 0, kept: 0, total: 0 };
  }

  const sorted = [...episodes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const used = new Set<number>();
  if (!options.overwrite) {
    for (const episode of sorted) {
      if (episode.episodeNumber && episode.episodeNumber > 0) {
        used.add(episode.episodeNumber);
      }
    }
  }

  let nextCandidate = 1;
  let updated = 0;
  let kept = 0;

  for (const episode of sorted) {
    const hasValidExisting =
      !options.overwrite &&
      episode.episodeNumber !== undefined &&
      episode.episodeNumber !== null &&
      episode.episodeNumber > 0 &&
      !used.has(episode.episodeNumber);

    const desired = hasValidExisting ? episode.episodeNumber! : nextAvailableNumber(used, nextCandidate);
    used.add(desired);
    nextCandidate = Math.max(nextCandidate, desired + 1);

    if (hasValidExisting && episode.episodeNumber === desired) {
      kept += 1;
      continue;
    }

    const label = episode.title ? ` "${episode.title}"` : '';
    if (options.dryRun) {
      logger.log(`[dry-run] user=${userId} episode=${episode.id}${label} -> #${desired}`);
    } else {
      await repository.update(userId, episode.id, { episodeNumber: desired });
    }
    updated += 1;
  }

  return { updated, kept, total: sorted.length };
}

async function run() {
  const logger = new Logger('BackfillEpisodeNumbers');
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const configService = app.get(ConfigService);
    const repository = app.get<EpisodesRepository>(EPISODES_REPOSITORY);
    const supabaseClient = buildSupabaseClient(configService);

    const userIds = await loadUserIds(supabaseClient, options.userId);
    if (!userIds.length) {
      logger.warn('No users with episodes found; nothing to backfill');
      return;
    }

    for (const userId of userIds) {
      const { updated, kept, total } = await assignNumbersForUser(repository, userId, options, logger);
      logger.log(`User ${userId}: updated ${updated}, kept ${kept}, total ${total}`);
    }
  } finally {
    await app.close();
  }
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
