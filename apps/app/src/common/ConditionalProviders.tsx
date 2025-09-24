import * as React from 'react';
import { ConditionalProviders as SharedConditionalProviders } from '@legacy-sports/shared-components';

/**
 * App-specific ConditionalProviders
 *
 * Uses the shared-components ConditionalProviders which implements
 * the platform-components architecture for automatic platform selection.
 */
export function ConditionalProviders({
  children,
}: React.PropsWithChildren): React.ReactNode {
  return <SharedConditionalProviders>{children}</SharedConditionalProviders>;
}
