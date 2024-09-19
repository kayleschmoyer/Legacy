import { LOGGER } from '@legacy-sports/logging';

export function getMessageFromError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  return 'An unknown error occurred';
}

export function logError(err: unknown): void {
  if (err instanceof Error) {
    LOGGER.error(err, err.stack);
  }

  if (typeof err === 'string') {
    LOGGER.error(err);
  }

  LOGGER.error('An unknown error occurred');
}
