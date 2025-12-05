import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from '../src/app.module';
import { EpisodeProcessorService } from '../src/episodes/episode-processor.service';
import { EPISODES_QUEUE_NAME, REDIS_CONNECTION_TOKEN } from '../src/queue/queue.constants';
import { InMemoryStoreService } from '../src/common/in-memory-store.service';

async function bootstrap() {
  const logger = new Logger('EpisodeWorker');
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const redisConnection = appContext.get(REDIS_CONNECTION_TOKEN);
  appContext.get(InMemoryStoreService); // ensure in-memory store initialized

  const worker = new Worker(
    EPISODES_QUEUE_NAME,
    async (job) => {
      const processor = appContext.get(EpisodeProcessorService);
      await processor.process(job);
    },
    { connection: redisConnection },
  );

  worker.on('completed', (job) => {
    logger.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err?.message}`);
  });

  const shutdown = async () => {
    await worker.close();
    await appContext.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.log('Episode worker started');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start worker', err);
  process.exit(1);
});
