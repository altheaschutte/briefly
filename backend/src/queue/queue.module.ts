import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EPISODES_QUEUE_NAME, EPISODES_QUEUE_TOKEN, REDIS_CONNECTION_TOKEN } from './queue.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CONNECTION_TOKEN,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (!redisUrl) {
          throw new Error('REDIS_URL must be set for queue connections');
        }
        return new Redis(redisUrl);
      },
    },
    {
      provide: EPISODES_QUEUE_TOKEN,
      inject: [REDIS_CONNECTION_TOKEN],
      useFactory: (connection: Redis) => {
        return new Queue(EPISODES_QUEUE_NAME, { connection });
      },
    },
  ],
  exports: [EPISODES_QUEUE_TOKEN, REDIS_CONNECTION_TOKEN],
})
export class QueueModule {}
