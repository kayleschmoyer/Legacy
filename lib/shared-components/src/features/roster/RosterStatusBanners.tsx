import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Info, Lock } from '@tamagui/lucide-icons';

export interface RosterStatusBannersProps {
  /** Viewing a finalized past week — lineup is read-only. */
  isPast: boolean;
  /** Viewing a future week — changes are provisional. */
  isFuture: boolean;
}

interface BannerProps {
  kind: 'info' | 'warning';
  icon: React.ReactNode;
  title: string;
  sub: string;
}

function Banner({ kind, icon, title, sub }: BannerProps): React.JSX.Element {
  const palette =
    kind === 'warning'
      ? {
          bg: '$orange3',
          border: '$orange7',
          title: '$orange11',
          sub: '$orange11',
        }
      : {
          bg: '$surfaceInteractive',
          border: '$outlineSubtle',
          title: '$brandGold',
          sub: '$brandGoldLight',
        };
  return (
    <XStack
      role="status"
      aria-live="polite"
      borderRadius="$4"
      borderWidth={1}
      backgroundColor={palette.bg}
      borderColor={palette.border}
      padding="$3"
      gap="$2"
      alignItems="flex-start"
    >
      <YStack paddingTop="$0.5">{icon}</YStack>
      <YStack flex={1} minWidth={0}>
        <Text fontSize="$3" fontWeight="700" color={palette.title}>
          {title}
        </Text>
        <Text fontSize="$2" color={palette.sub}>
          {sub}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * RosterStatusBanners — contextual historical / future-week banners for the
 * roster tab. Extracted from the web league-detail v2 roster tab (LS-7813) so
 * web and native render identical context messaging. Pending trade-offer and
 * waiver-claim banners remain data-bound components composed by each platform
 * around this control on the current week.
 */
export function RosterStatusBanners({
  isPast,
  isFuture,
}: RosterStatusBannersProps): React.JSX.Element | null {
  if (isPast) {
    return (
      <Banner
        kind="info"
        icon={<Lock size={18} color="var(--blue11)" />}
        title="Historical Mode"
        sub="This matchup is finalized. Lineup changes are locked for past weeks."
      />
    );
  }
  if (isFuture) {
    return (
      <Banner
        kind="warning"
        icon={<Info size={18} color="var(--orange11)" />}
        title="Future Week — Read Only"
        sub="Lineup changes are not available for future weeks. Return to the current week to update your lineup."
      />
    );
  }
  return null;
}
