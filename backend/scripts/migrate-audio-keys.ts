import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';
import { EPISODES_REPOSITORY, EpisodesRepository } from '../src/episodes/episodes.repository';
import { Episode } from '../src/domain/types';

interface CliOptions {
  userId?: string;
  episodeId?: string;
  overwrite: boolean;
  dryRun: boolean;
  deleteSource: boolean;
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
  const dryRun = argv.includes('--dry-run');
  const deleteSource = argv.includes('--delete-source') || argv.includes('--move');

  return { userId, episodeId, overwrite, dryRun, deleteSource };
}

function buildSupabaseClient(configService: ConfigService): SupabaseClient {
  const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
  const serviceKey =
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || configService.get<string>('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON) must be set');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loadUserIds(client: SupabaseClient, userIdOverride?: string): Promise<string[]> {
  if (userIdOverride) {
    return [userIdOverride];
  }
  const { data, error } = await client.from('episodes').select('user_id').not('audio_url', 'is', null);
  if (error) {
    throw new Error(`Failed to load users with audio: ${error.message}`);
  }
  const ids = Array.from(new Set((data || []).map((row: any) => row.user_id).filter(Boolean)));
  return ids as string[];
}

function buildS3Client(configService: ConfigService) {
  const bucket =
    configService.get<string>('AUDIO_BUCKET_NAME') || configService.get<string>('S3_BUCKET_NAME');
  const region =
    configService.get<string>('AUDIO_S3_REGION') || configService.get<string>('S3_REGION');
  const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
  const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');
  const endpoint = configService.get<string>('S3_ENDPOINT');

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3 configuration for audio migration');
  }

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, bucket, region };
}

function normalizeKey(raw: string, bucket: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('file://')) {
    return undefined;
  }
  const s3Match = trimmed.match(/^s3:\/\/([^/]+)\/(.+)$/i);
  if (s3Match) {
    const [, rawBucket, key] = s3Match;
    return rawBucket === bucket ? key : `${rawBucket}/${key}`;
  }
  try {
    const url = new URL(trimmed);
    let key = url.pathname.replace(/^\/+/, '');
    if (url.hostname === 's3.amazonaws.com' && key.startsWith(`${bucket}/`)) {
      key = key.slice(bucket.length + 1);
    } else if (url.hostname.includes(bucket) && key) {
      // Virtual-hosted-style URL: bucket.s3.amazonaws.com/<key>
      key = key;
    }
    return key || undefined;
  } catch {
    return trimmed.replace(/^\/+/, '');
  }
}

function encodeForCopy(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function copyIfNeeded(
  s3: S3Client,
  bucket: string,
  sourceKey: string,
  destKey: string,
  overwrite: boolean,
  deleteSource: boolean,
  logger: Logger,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey }));
  } catch (error) {
    logger.warn(`Source missing: s3://${bucket}/${sourceKey} (${String(error)})`);
    return false;
  }

  if (!overwrite) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: destKey }));
      logger.log(`Destination exists, skipping copy: s3://${bucket}/${destKey}`);
      return true;
    } catch {
      // Destination does not exist; proceed
    }
  }

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: destKey,
      CopySource: `${bucket}/${encodeForCopy(sourceKey)}`,
      ContentType: 'audio/mpeg',
    }),
  );
  logger.log(`Copied ${sourceKey} -> ${destKey}`);

  if (deleteSource) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey }));
    logger.log(`Deleted source ${sourceKey}`);
  }
  return true;
}

async function migrateEpisode(
  episode: Episode,
  userId: string,
  repo: EpisodesRepository,
  s3: S3Client,
  bucket: string,
  options: CliOptions,
  logger: Logger,
) {
  if (!episode.audioUrl) {
    return;
  }

  const desiredKey = `${userId}/${episode.id}.mp3`;
  const sourceKey = normalizeKey(episode.audioUrl, bucket);
  if (!sourceKey) {
    logger.warn(`Skipping episode ${episode.id}: could not normalize audio key from "${episode.audioUrl}"`);
    return;
  }

  const alreadyInPlace = sourceKey === desiredKey;
  if (options.dryRun) {
    logger.log(`[dry-run] ${episode.id} :: ${sourceKey} -> ${desiredKey} ${alreadyInPlace ? '(no-op)' : ''}`);
    return;
  }

  if (!alreadyInPlace) {
    const copied = await copyIfNeeded(
      s3,
      bucket,
      sourceKey,
      desiredKey,
      options.overwrite,
      options.deleteSource,
      logger,
    );
    if (!copied) {
      return;
    }
  } else {
    logger.log(`Episode ${episode.id} already at desired key; updating DB only if needed`);
  }

  await repo.update(userId, episode.id, { audioUrl: desiredKey });
  logger.log(`Updated episode ${episode.id} audioUrl -> ${desiredKey}`);
}

async function run() {
  const logger = new Logger('MigrateAudioKeys');
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const configService = app.get(ConfigService);
    const repository = app.get<EpisodesRepository>(EPISODES_REPOSITORY);
    const supabase = buildSupabaseClient(configService);
    const { client: s3, bucket } = buildS3Client(configService);

    const userIds = await loadUserIds(supabase, options.userId);
    if (!userIds.length) {
      logger.warn('No users with audio found; nothing to migrate');
      return;
    }

    for (const userId of userIds) {
      const episodes = options.episodeId
        ? await repository.listByUser(userId, { includeArchived: true, includeFailed: true }).then((list) =>
            list.filter((ep) => ep.id === options.episodeId),
          )
        : await repository.listByUser(userId, { includeArchived: true, includeFailed: true });

      const withAudio = episodes.filter((ep) => ep.audioUrl);
      if (!withAudio.length) {
        logger.log(`User ${userId}: no episodes with audio; skipping`);
        continue;
      }

      logger.log(`User ${userId}: migrating ${withAudio.length} episode(s)`);
      for (const episode of withAudio) {
        await migrateEpisode(episode, userId, repository, s3, bucket, options, logger);
      }
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
