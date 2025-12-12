import { Inject, Injectable } from '@nestjs/common';
import { TopicQuery } from '../domain/types';
import {
  TOPIC_QUERIES_REPOSITORY,
  TopicQueriesRepository,
  TopicQueryCreateInput,
} from './topic-queries.repository';

@Injectable()
export class TopicQueriesService {
  constructor(
    @Inject(TOPIC_QUERIES_REPOSITORY) private readonly repository: TopicQueriesRepository,
  ) {}

  listByTopic(userId: string, topicId: string): Promise<TopicQuery[]> {
    return this.repository.listByTopic(userId, topicId);
  }

  listByEpisode(userId: string, episodeId: string): Promise<TopicQuery[]> {
    return this.repository.listByEpisode(userId, episodeId);
  }

  createMany(userId: string, inputs: TopicQueryCreateInput[]): Promise<TopicQuery[]> {
    if (!inputs.length) {
      return Promise.resolve([]);
    }
    return this.repository.createMany(userId, inputs);
  }
}
