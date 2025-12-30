import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EpisodeSegment, EpisodeSource } from '../domain/types';
import { EpisodeMetadata } from './llm.provider';
import { DialogueTurn, SegmentDialogueScript, TopicIntent, TopicQueryPlan } from './llm.types';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Injectable()
export class XaiLlmProvider extends OpenAiLlmProvider {
  constructor(configService: ConfigService) {
    const xaiPrefixes = ['LLM_PROVIDER_XAI', 'LLM_PROVIDER_GROK'];
    super(configService, {
      apiKeyConfigKeys: [...xaiPrefixes.map((prefix) => `${prefix}_API_KEY`), 'XAI_API_KEY'],
      baseUrlConfigKeys: [...xaiPrefixes.map((prefix) => `${prefix}_BASE_URL`), 'XAI_BASE_URL'],
      rewriteModelConfigKeys: [...xaiPrefixes.map((prefix) => `${prefix}_REWRITE_MODEL`), 'LLM_PROVIDER_REWRITE_MODEL'],
      scriptModelConfigKeys: [...xaiPrefixes.map((prefix) => `${prefix}_SCRIPT_MODEL`), 'LLM_PROVIDER_SCRIPT_MODEL'],
      extractionModelConfigKeys: [
        ...xaiPrefixes.map((prefix) => `${prefix}_EXTRACTION_MODEL`),
        'LLM_PROVIDER_EXTRACTION_MODEL',
      ],
      defaultBaseUrl: 'https://api.x.ai/v1',
      defaultQueryModel: 'grok-4-0709',
      defaultScriptModel: 'grok-4-0709',
      defaultExtractionModel: 'grok-4-0709',
      providerLabel: 'XAI LLM provider',
    });
  }

}
