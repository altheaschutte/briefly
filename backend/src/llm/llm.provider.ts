export interface LlmProvider {
  rewriteTopic(topic: string): Promise<string>;
  generateScript(segments: any[], targetDurationMinutes?: number): Promise<string>;
}
