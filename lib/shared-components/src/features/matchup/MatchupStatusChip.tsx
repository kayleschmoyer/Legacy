import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { MatchupStatus } from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GREEN,
  GREEN_LIGHT,
  TEXT_MUTED,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const Chip = tamaguiStyled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
}) as StyledComponent;

export interface MatchupStatusConfig {
  bg: string;
  border: string;
  text: string;
  label: string;
  live: boolean;
}

/**
 * Maps a matchup status to its chip colours/label. Shared by
 * `MatchupScoreboardHero` and `MatchupStatusChip` so every surface that shows
 * matchup status (web hero, native hero, football's compact header) renders
 * identical styling (LS-6362).
 */
export function statusConfigFor(status?: string | null): MatchupStatusConfig {
  if (status == null) {
    return {
      bg: withAlpha(TEXT_MUTED, 0.14),
      border: withAlpha(TEXT_MUTED, 0.4),
      text: TEXT_MUTED,
      label: 'Status unknown',
      live: false,
    };
  }
  // Cast to MatchupStatus so TypeScript enforces exhaustiveness via the never default.
  const s = status as MatchupStatus;
  switch (s) {
    case MatchupStatus.InProgress:
      return {
        bg: withAlpha(GREEN, 0.16),
        border: withAlpha(GREEN, 0.5),
        text: GREEN_LIGHT,
        label: 'Live',
        live: true,
      };
    case MatchupStatus.Completed:
      return {
        bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
        border: withAlpha(BRAND_NAVY_LIGHT, 0.5),
        text: BRAND_GOLD_LIGHT,
        label: 'Final',
        live: false,
      };
    case MatchupStatus.Cancelled:
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Cancelled',
        live: false,
      };
    case MatchupStatus.Scheduled:
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Scheduled',
        live: false,
      };
    default: {
      // Compile-time exhaustiveness: adding a new MatchupStatus without a case
      // here will cause a TypeScript error.
      const _exhaustive: never = s;
      void _exhaustive;
      return {
        bg: withAlpha(TEXT_MUTED, 0.14),
        border: withAlpha(TEXT_MUTED, 0.4),
        text: TEXT_MUTED,
        label: 'Status unknown',
        live: false,
      };
    }
  }
}

export interface MatchupStatusChipProps {
  status?: string | null;
  /** Optional trailing detail appended after the status label, e.g. "Week 7". */
  detail?: string | null;
}

/**
 * Standalone status chip — coloured pill with a pulsing dot when live —
 * matching `MatchupScoreboardHero`'s status chip. For screens that need just
 * the chip without the full hero layout (e.g. football's compact matchup
 * header, LS-6362).
 */
export function MatchupStatusChip({ status, detail }: MatchupStatusChipProps) {
  const chip = statusConfigFor(status);
  return (
    <Chip backgroundColor={chip.bg} borderColor={chip.border}>
      {chip.live && (
        <YStack
          width={6}
          height={6}
          borderRadius={3}
          backgroundColor={chip.text}
        />
      )}
      <Text
        fontSize="$2"
        fontWeight="700"
        color={chip.text}
        letterSpacing={0.5}
      >
        {detail ? `${chip.label} · ${detail}` : chip.label}
      </Text>
    </Chip>
  );
}
