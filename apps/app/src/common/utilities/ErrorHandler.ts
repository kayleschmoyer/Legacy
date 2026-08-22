import { Alert } from 'react-native';
import { LOGGER } from '@legacy-sports/logging';
import { getMessageFromError } from '@legacy-sports/utils';

// LOGGER.error/.fatal are auto-forwarded to Rollbar via RollbarOutputDestination
// (see lib/rollbar/src/lib/rollbar.native.ts init()) — do not also call
// captureError() here, or every handled error is reported twice, once under
// a generic "Error occurred:" title (RollbarOutputDestination can only pull
// the specific message from an Error-typed arg, not a plain string).
export function handleError(err: unknown): void {
  const message = getMessageFromError(err);
  const errorObj = err instanceof Error ? err : new Error(message);

  LOGGER.error(message, errorObj);
  Alert.alert('Error', message);
}
