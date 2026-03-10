import { Alert } from 'react-native';
import { captureError } from '@legacy-sports/rollbar/native';
import { LOGGER } from '@legacy-sports/logging';
import { getMessageFromError } from '@legacy-sports/utils';

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);
  const errorObj = err instanceof Error ? err : new Error(message);

  LOGGER.error('Error occurred:', message);
  captureError(errorObj);
  Alert.alert('Error', message);
}
