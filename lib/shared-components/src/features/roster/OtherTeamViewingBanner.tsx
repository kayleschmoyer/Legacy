import React from 'react';
import { Button, Text, XStack } from 'tamagui';
import { ChevronLeft } from '@tamagui/lucide-icons/icons/ChevronLeft';
import { Eye } from '@tamagui/lucide-icons/icons/Eye';

export interface OtherTeamViewingBannerProps {
  /** Name of the team whose roster is being viewed. */
  teamName: string;
  /** Navigate back to the viewer's own roster. */
  onBackToMyRoster: () => void;
}

/**
 * OtherTeamViewingBanner — shown atop the roster tab when a member navigates
 * to another team's roster (via standings or matchup click). Roster becomes
 * read-only for the duration; "Back to My Roster" clears the viewed team.
 * Mirrors web v2's inline banner (LS-6335) for cross-platform parity.
 */
export function OtherTeamViewingBanner({
  teamName,
  onBackToMyRoster,
}: OtherTeamViewingBannerProps): React.JSX.Element {
  return (
    <XStack
      role="status"
      aria-live="polite"
      alignItems="center"
      gap="$3"
      borderRadius="$4"
      borderWidth={1}
      backgroundColor="$surfaceInteractive"
      borderColor="$outlineSubtle"
      padding="$3"
    >
      <Button
        size="$3"
        backgroundColor="$surfacePanel"
        borderColor="$brandGoldLight"
        borderWidth={1}
        onPress={onBackToMyRoster}
        icon={<ChevronLeft size={16} color="$brandGoldLight" />}
        accessibilityRole="button"
      >
        <Text fontSize="$3" fontWeight="600" color="$brandGoldLight">
          Back to My Roster
        </Text>
      </Button>
      <XStack flex={1} alignItems="center" gap="$2" minWidth={0}>
        <Eye size={16} color="$textMuted" />
        <Text
          flex={1}
          minWidth={0}
          numberOfLines={1}
          fontSize="$3"
          color="$textMuted"
          fontStyle="italic"
        >
          Viewing {teamName}&apos;s roster
        </Text>
      </XStack>
    </XStack>
  );
}
