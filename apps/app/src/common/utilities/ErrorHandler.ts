import { getMessageFromError } from '@legacy-sports/utils';

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  // TODO: Replace with better error handling solution
  console.error('Error occurred:', message);
}
