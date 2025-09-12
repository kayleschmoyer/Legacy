import { Platform } from 'react-native';
import * as React from 'react';
import { WebProviders } from './providers/web/WebProviders';

export function ConditionalProviders({
  children,
}: React.PropsWithChildren): React.ReactNode {
  switch (Platform.OS) {
    case 'web':
      return <WebProviders>{children}</WebProviders>;
    default:
      return children;
  }
}
