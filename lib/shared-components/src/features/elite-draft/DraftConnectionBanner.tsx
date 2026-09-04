import React from 'react';
import { Button, Text, XStack } from 'tamagui';
import {
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  SURFACE_CARD,
  withAlpha,
} from '../../utils/colors';

export interface DraftConnectionBannerProps {
  /** Manually force a fresh socket handshake instead of waiting for backoff. */
  onRetry: () => void;
}

/**
 * The first tier of LS-9856's connection treatment: a strip that appears once
 * the draft socket has been down long enough to matter
 * (`DRAFT_RECONNECTING_DELAY_MS`) but not long enough to give up on
 * (`DRAFT_CONNECTION_LOST_DELAY_MS`, which swaps the whole board for
 * `ConnectionLostScreen`).
 *
 * It says the board is stale rather than that it is broken, because at this
 * point recovery is still the likely outcome — the pick clock is dimmed
 * alongside it (`connectionStale` on DraftTopBand / DraftHeaderBand) so the
 * running timer cannot be read as live state.
 */
export function DraftConnectionBanner({
  onRetry,
}: DraftConnectionBannerProps): React.JSX.Element {
  return (
    <XStack
      testID="draft-connection-banner"
      role="alert"
      aria-live="assertive"
      alignItems="center"
      justifyContent="center"
      flexWrap="wrap"
      gap="$2"
      paddingVertical="$2"
      paddingHorizontal="$3"
      backgroundColor={withAlpha(BRAND_SEAM_RED, 0.18)}
      borderBottomWidth={1}
      borderBottomColor={withAlpha(BRAND_SEAM_RED_LIGHT, 0.45)}
      animation="quick"
      enterStyle={{ opacity: 0, y: -8 }}
      exitStyle={{ opacity: 0, y: -8 }}
    >
      <Text
        fontSize={12}
        fontWeight="700"
        letterSpacing={0.6}
        textTransform="uppercase"
        color="$brandSeamRedLight"
      >
        Reconnecting
      </Text>
      <Text fontSize={12} color="$textMuted" textAlign="center">
        Picks and the clock may be out of date.
      </Text>
      <Button
        testID="draft-connection-banner-retry"
        onPress={onRetry}
        size="$2"
        height={26}
        paddingHorizontal={12}
        borderRadius="$3"
        backgroundColor={withAlpha(SURFACE_CARD, 0.9)}
        borderWidth={1}
        borderColor={withAlpha(BRAND_SEAM_RED_LIGHT, 0.5)}
        color="$color"
        fontSize={12}
        fontWeight="700"
        pressStyle={{ scale: 0.98 }}
      >
        Retry now
      </Button>
    </XStack>
  );
}
