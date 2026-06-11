import { LOGGER } from '@legacy-sports/logging';

export function handleError(err: unknown): void {
  LOGGER.error('Error occurred:', err instanceof Error ? err : String(err));
}
