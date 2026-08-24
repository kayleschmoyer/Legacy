/**
 * LineupLockBanner — pre-lock countdown banner (LS-6368 / FMD-043).
 *
 * Shows "Lineup locks in Xh Ym" for scheduled matchups so users can see the
 * lock is imminent (and, implicitly, that it's correct for their local
 * kickoff time — the lock itself was already timezone-correct, it just had
 * no UI surface). Renders nothing once the matchup is no longer 'scheduled'
 * or there's no computed lock time.
 */
import React from 'react';
import { Card, Text, XStack } from 'tamagui';
import { Clock } from '@tamagui/lucide-icons/icons/Clock';
import {
  type LineupLockCountdownMatchup,
  useLineupLockCountdown,
} from './hooks/useLineupLockCountdown';

const WARN_TOKENS = { bg: '$warningMuted', border: '$amber7', fg: '$amber10' };
const URGENT_TOKENS = { bg: '$red3', border: '$red7', fg: '$red10' };
/** Below this, the banner switches to an "urgent" red treatment. */
const URGENT_THRESHOLD_SECONDS = 30 * 60;

/** Formats seconds as "Xh Ym" (or "Xm Ys" under an hour, "Xs" under a minute). */
export function formatLockCountdown(secondsRemaining: number): string {
  if (secondsRemaining <= 0) return 'now';

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export interface LineupLockBannerProps {
  matchup: LineupLockCountdownMatchup | null | undefined;
}

export function LineupLockBanner({ matchup }: LineupLockBannerProps) {
  const { secondsRemaining } = useLineupLockCountdown(matchup);

  if (matchup?.status !== 'scheduled' || secondsRemaining == null) {
    return null;
  }

  const isUrgent = secondsRemaining <= URGENT_THRESHOLD_SECONDS;
  const tokens = isUrgent ? URGENT_TOKENS : WARN_TOKENS;

  return (
    <Card
      backgroundColor={tokens.bg}
      borderColor={tokens.border}
      borderWidth={1}
      borderRadius="$4"
      padding="$3"
      data-testid="lineup-lock-banner"
    >
      <XStack gap="$2" alignItems="center">
        <Clock size={16} color={tokens.fg} />
        <Text
          fontSize="$3"
          fontWeight="700"
          color={tokens.fg}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Lineup locks in {formatLockCountdown(secondsRemaining)}
        </Text>
      </XStack>
    </Card>
  );
}
