import React from 'react';
import { XStack } from 'tamagui';
import { OUTLINE_SUBTLE } from './tokens';
import { Platform } from '../../../platform-components';
import { SURFACE_PANEL } from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

export interface StatsToolbarFrameProps {
  /**
   * Web CSS grid-template class. Defaults to `.ps-toolbar` (baseball's
   * 5-column search/position/team/rows/actions layout). Football passes its own
   * variant class so its different control count doesn't collide.
   */
  webGridClassName?: string;
  children: React.ReactNode;
}

/**
 * The styled filter-controls toolbar container (panel surface, rounded, gridded
 * on web / stacked on native). Carries `testID="filter-controls"` so existing
 * e2e selectors keep resolving. Sport-neutral — the controls + action buttons
 * are supplied as children.
 */
export function StatsToolbarFrame({
  webGridClassName = 'ps-toolbar',
  children,
}: StatsToolbarFrameProps) {
  return (
    <XStack
      testID="filter-controls"
      className={Platform.OS === 'web' ? webGridClassName : undefined}
      style={csp({
        display: Platform.OS === 'web' ? 'grid' : 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        background: SURFACE_PANEL,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 16,
      })}
    >
      {children}
    </XStack>
  );
}
