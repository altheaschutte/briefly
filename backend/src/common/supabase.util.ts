import { Logger, ServiceUnavailableException } from '@nestjs/common';

type NetworkErrno = NodeJS.ErrnoException & {
  hostname?: string;
  address?: string;
  port?: number;
};

type FetchError = Error & { cause?: NetworkErrno };

const isFetchFailed = (err: unknown): err is FetchError => {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return err instanceof Error && (message === 'fetch failed' || message.includes('failed to fetch'));
};

const formatCause = (cause?: NetworkErrno): string => {
  if (!cause) return '';
  const parts = [
    cause.code,
    cause.hostname ?? cause.address,
    cause.port ? `port ${cause.port}` : undefined,
    cause.message && cause.message !== 'fetch failed' ? cause.message : undefined,
  ].filter(Boolean);
  return parts.join(' ');
};

export async function handleSupabaseErrors<T>(
  logger: Logger,
  context: string,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (isFetchFailed(err)) {
      const details = formatCause(err.cause);
      logger.error(`${context}: Supabase fetch failed${details ? ` (${details})` : ''}`);
      throw new ServiceUnavailableException(
        'Unable to reach our authentication service. Please retry or sign in again.',
      );
    }
    throw err;
  }
}
