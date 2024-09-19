import { getMessageFromError } from '@legacy-sports/utils';
import Toast from 'react-native-toast-message';

export function handleError(err: unknown): void {
  const message = getMessageFromError(err);

  Toast.show({
    text1: 'An Error Occurred',
    text2: message,
    type: 'error',
  });
}
