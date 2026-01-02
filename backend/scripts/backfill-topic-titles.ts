import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppModule } from '../src/app.module';
import { LlmService } from '../src/llm/llm.service';

interface CliOptions {
  userId: string;
  overwrite: boolean;
  dryRun: boolean;
  includeSystemGenerated: boolean;
  includeSeed: boolean;
  limit?: number;
}

type TopicRow = {
  id: string;
  user_id: string;
  title: string | null;
  original_text: string;
  is_seed: boolean;
  segment_dive_deeper_seed_id: string | null;
  created_at: string;
};

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
  const includeSystemGenerated = argv.includes('--include-system-generated');
  const includeSeed = argv.includes('--include-seed');
  const limitRaw = get('--limit', '-l');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!userId) {
    throw new Error(
      'Usage: ts-node scripts/backfill-topic-titles.ts --user <userId> [--overwrite] [--dry-run] [--include-system-generated] [--include-seed] [--limit <n>]\n' +
        'Positional args also supported: ts-node scripts/backfill-topic-titles.ts <userId>',
    );
  }

  if (limit !== undefined && (Number.isFinite(limit) === false || limit <= 0)) {
    throw new Error('--limit must be a positive number');
  }

  return { userId, overwrite, dryRun, includeSystemGenerated, includeSeed, limit };
}

async function run() {
  const logger = new Logger('BackfillTopicTitles');
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const configService = app.get(ConfigService);
    const llmService = app.get(LlmService);
    const supabase = buildSupabaseClient(configService);

    const topics = await loadTopics(supabase, args);
    logger.log(`Found ${topics.length} topic(s) to process`);

    let updatedCount = 0;
    for (const topic of topics) {
      const originalText = (topic.original_text || '').trim();
      if (!originalText) {
        logger.warn(`Skipping ${topic.id} (original_text is empty)`);
        continue;
      }

      const titleAlreadyPresent = Boolean((topic.title || '').trim());
      if (titleAlreadyPresent && !args.overwrite) {
        logger.log(`Skipping ${topic.id} (already has title)`);
        continue;
      }

      const title = await generateTitle(llmService, originalText);
      if (!title) {
        logger.warn(`Skipping ${topic.id} (could not generate title)`);
        continue;
      }

      if (args.dryRun) {
        logger.log(`Dry run: would set title for ${topic.id} to "${title}"`);
        continue;
      }

      const { error } = await supabase
        .from('topics')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', topic.id)
        .eq('user_id', args.userId);

      if (error) {
        logger.warn(`Failed to update ${topic.id}: ${error.message}`);
        continue;
      }

      updatedCount += 1;
      logger.log(`Updated ${topic.id} title to "${title}"`);
    }

    logger.log(`Done. Updated ${updatedCount} topic(s).`);
  } finally {
    await app.close();
  }
}

function buildSupabaseClient(configService: ConfigService): SupabaseClient {
  const supabaseUrl = configService.get<string>('SUPABASE_PROJECT_URL');
  const serviceKey =
    configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || configService.get<string>('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadTopics(supabase: SupabaseClient, args: CliOptions): Promise<TopicRow[]> {
  let query = supabase
    .from('topics')
    .select('id,user_id,title,original_text,is_seed,segment_dive_deeper_seed_id,created_at')
    .eq('user_id', args.userId)
    .order('created_at', { ascending: true });

  if (!args.includeSeed) {
    query = query.eq('is_seed', false);
  }

  if (!args.includeSystemGenerated) {
    query = query.is('segment_dive_deeper_seed_id', null);
  }

  if (!args.overwrite) {
    query = query.or('title.is.null,title.eq.""');
  }

  if (args.limit) {
    query = query.limit(args.limit);
  }

  const { data, error } = await query;
  if (error) {
    if (String(error.message || '').toLowerCase().includes('column') && String(error.message || '').includes('title')) {
      throw new Error(
        `The topics table does not have a title column yet (${error.message}). Run the migration that adds it first.`,
      );
    }
    throw error;
  }

  return (data as TopicRow[] | null) ?? [];
}

async function generateTitle(llmService: LlmService, originalText: string): Promise<string> {
  const trimmed = (originalText || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    const meta = await llmService.generateTopicMeta(trimmed);
    const normalized = normalizeTitle(meta?.title || '');
    return normalized || normalizeTitle(trimmed);
  } catch {
    return normalizeTitle(trimmed);
  }
}

function normalizeTitle(input: string): string {
  const cleaned = (input || '')
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/[.!,;:]+$/g, '')
    .replace(/[^\p{L}\p{N}\s'’\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return '';
  }

  const words = cleaned.split(' ').filter(Boolean);
  const lowered = words.map((w) => w.toLowerCase());

  // Strip common “Briefly seed” leading verbs/phrases.
  if (lowered[0] === 'tell' && lowered[1] === 'me') {
    words.splice(0, 2);
  } else if (lowered[0] === 'update' && lowered[1] === 'me') {
    words.splice(0, 2);
  } else if (lowered[0] === 'alert' && lowered[1] === 'me') {
    words.splice(0, 2);
  } else if (lowered[0] === 'dive' && lowered[1] === 'into') {
    words.splice(0, 2);
  } else if (
    ['share', 'highlight', 'reveal', 'explore', 'uncover'].includes(lowered[0] || '')
  ) {
    words.splice(0, 1);
  }

  const trimmedWords = words.filter(Boolean);
  if (!trimmedWords.length) {
    return cleaned.split(' ').filter(Boolean).slice(0, 3).join(' ');
  }

  return trimmedWords.slice(0, 3).join(' ');
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
