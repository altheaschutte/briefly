import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { AppModule } from '../src/app.module';
import { TopicsService } from '../src/topics/topics.service';
import { TopicQueriesService } from '../src/topic-queries/topic-queries.service';
import { PerplexityService } from '../src/perplexity/perplexity.service';
import { LlmService } from '../src/llm/llm.service';
import { TopicQueryCreateInput } from '../src/topic-queries/topic-queries.repository';
import { EpisodeSegment } from '../src/domain/types';
import {
  buildEpisodeSources,
  buildSegmentContent,
  combineDialogueScripts,
  renderDialogueScript,
  selectFreshQueries,
} from '../src/episodes/episode-script.utils';
import { getElevenLabsDefaultVoices } from '../src/tts/voice-config';
import { TTS_PROVIDER_TOKEN } from '../src/tts/tts.constants';
import { ElevenLabsProvider } from '../src/tts/elevenlabs.provider';

interface CliOptions {
  userId: string;
  voiceA?: string;
  voiceB?: string;
  durationMinutes?: number;
  verbose: boolean;
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
  const voiceA = get('--voiceA', '-a');
  const voiceB = get('--voiceB', '-b');
  const durationRaw = get('--duration', '-d');
  const durationMinutes = durationRaw ? Number(durationRaw) : undefined;
  const verbose = argv.includes('--verbose') || argv.includes('-v');

  if (!userId) {
    throw new Error(
      'Usage: ts-node scripts/generate-script-preview.ts --user <userId> [--voiceA <voiceId>] [--voiceB <voiceId>] [--duration <minutes>] [--verbose]\n' +
        'Positional args also supported: ts-node scripts/generate-script-preview.ts <userId>',
    );
  }

  return { userId, voiceA, voiceB, durationMinutes, verbose };
}

async function run() {
  const logger = new Logger('GenerateScriptPreview');
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const topicsService = app.get(TopicsService);
    const topicQueriesService = app.get(TopicQueriesService);
    const perplexityService = app.get(PerplexityService);
    const llmService = app.get(LlmService);
    const ttsProvider = app.get(TTS_PROVIDER_TOKEN) as unknown;
    if (!(ttsProvider instanceof ElevenLabsProvider)) {
      throw new Error('Script preview currently supports ElevenLabs provider only');
    }
    const elevenLabsProvider = ttsProvider as ElevenLabsProvider;
    const configService = app.get(ConfigService);

    const topics = (await topicsService.listTopics(args.userId))
      .filter((t) => t.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    if (!topics.length) {
      throw new Error('No active topics configured for user');
    }

    const targetDuration =
      typeof args.durationMinutes === 'number' && !Number.isNaN(args.durationMinutes)
        ? args.durationMinutes
        : Number(configService.get('EPISODE_DEFAULT_DURATION_MINUTES')) || 20;
    const perSegmentTargetMinutes = Math.max(1, Math.round(targetDuration / topics.length));
    const previewEpisodeId = `preview-${Date.now()}`;
    const defaults = getElevenLabsDefaultVoices(configService);
    const voiceA = args.voiceA || defaults.voiceA;
    const voiceB = args.voiceB || defaults.voiceB;

    logger.log(
      `Generating script for user ${args.userId} (${topics.length} topic(s)), ` +
        `~${perSegmentTargetMinutes}-minute segments, voices A=${voiceA}, B=${voiceB}`,
    );

    const segments: EpisodeSegment[] = [];

    for (const [index, topic] of topics.entries()) {
      logger.log(`Topic ${index + 1}/${topics.length}: ${topic.originalText}`);
      const previousQueries = await topicQueriesService.listByTopic(args.userId, topic.id);
      const topicPlan = await llmService.generateTopicQueries(
        topic.originalText,
        previousQueries.map((q) => q.query),
      );
      const topicIntent = topicPlan.intent;
      const freshQueries = selectFreshQueries(topicPlan.queries, previousQueries);
      const fallbackQueries = selectFreshQueries([topic.originalText], previousQueries);
      const plannedQueries = (freshQueries.length ? freshQueries : fallbackQueries).slice(0, 5);
      const queriesToRun = plannedQueries.length ? plannedQueries : [topic.originalText];

      const queryResults: TopicQueryCreateInput[] = [];
      for (const [orderIndex, queryText] of queriesToRun.entries()) {
        const perplexityResult = await perplexityService.search(queryText);
        queryResults.push({
          topicId: topic.id,
          episodeId: previewEpisodeId,
          query: queryText,
          answer: perplexityResult.answer,
          citations: perplexityResult.citations || [],
          orderIndex,
          intent: topicIntent,
        });
      }

      const segmentId = uuid();
      const segmentSources = buildEpisodeSources(queryResults, previewEpisodeId, segmentId);
      const segmentContent = buildSegmentContent(topic.originalText, queryResults);
      let segmentDialogue = await llmService.generateSegmentScript(
        topic.originalText,
        segmentContent,
        segmentSources,
        topicIntent,
        perSegmentTargetMinutes,
      );
      try {
        segmentDialogue = await llmService.enhanceSegmentDialogueForElevenV3(segmentDialogue);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Dialogue enhancement failed for topic ${topic.id}: ${message}`);
      }
      const segmentScriptText = renderDialogueScript(segmentDialogue);
      const preview = elevenLabsProvider.buildPreview(segmentDialogue, { voiceA, voiceB });

      if (args.verbose) {
        logger.log(`Would call ${preview.primary.endpoint} for segment ${index + 1}`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(preview.primary.body, null, 2));
        logger.log(`Fallback would call ${preview.fallback.endpoint}`);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(preview.fallback.body, null, 2));
      }

      segments.push({
        id: segmentId,
        episodeId: previewEpisodeId,
        orderIndex: index,
        title: topic.originalText,
        intent: segmentDialogue.intent || topicIntent,
        rawContent: segmentContent,
        rawSources: segmentSources,
        script: segmentScriptText,
        dialogueScript: segmentDialogue,
        audioUrl: '',
        startTimeSeconds: 0,
        durationSeconds: undefined,
      });
    }

    const combinedDialogue = combineDialogueScripts(segments);
    const combinedScript = renderDialogueScript(combinedDialogue);
    const finalPreview = elevenLabsProvider.buildPreview(combinedDialogue, { voiceA, voiceB });

    logger.log('--- ElevenLabs request preview (primary) ---');
    // eslint-disable-next-line no-console
    console.log(finalPreview.primary.endpoint);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(finalPreview.primary.body, null, 2));
    logger.log('--- ElevenLabs fallback request preview ---');
    // eslint-disable-next-line no-console
    console.log(finalPreview.fallback.endpoint);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(finalPreview.fallback.body, null, 2));

    logger.log('--- Combined script ---');
    // eslint-disable-next-line no-console
    console.log(combinedScript);
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
