import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight } from '@tamagui/lucide-icons';

export interface RosterWeekNavigationProps {
  /** The week currently being viewed. */
  week: number;
  /** The league's live/current week. */
  currentWeek: number;
  /** Total number of matchup weeks in the season. */
  totalWeeks: number;
  /** Called with the new week when the user steps the picker. */
  onWeekChange: (week: number) => void;
  /** Called when the user taps "Reset to Current". */
  onResetToCurrent: () => void;
}

interface ChipConfig {
  label: string;
  bg: string;
  border: string;
  text: string;
}

/**
 * RosterWeekNavigation — prev/next week picker with a status chip
 * (Current / Frozen / Upcoming) and a "Reset to Current" affordance.
 *
 * Extracted from the web league-detail v2 roster tab (LS-7813) so web and
 * native share one navigation control. Pure presentation: the caller owns week
 * state and passes it down.
 */
export function RosterWeekNavigation({
  week,
  currentWeek,
  totalWeeks,
  onWeekChange,
  onResetToCurrent,
}: RosterWeekNavigationProps): React.JSX.Element {
  const isPast = week < currentWeek;
  const isCurrent = week === currentWeek;
  const atFirst = week <= 1;
  const atLast = week >= totalWeeks;

  const chip: ChipConfig = isCurrent
    ? { label: 'Current', bg: '$green3', border: '$green7', text: '$green11' }
    : isPast
      ? { label: 'Frozen', bg: '$gray4', border: '$gray7', text: '$gray11' }
      : {
          label: 'Upcoming',
          bg: '$surfaceInteractive',
          border: '$outlineStrong',
          text: '$brandGoldLight',
        };

  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      gap="$2"
      flexWrap="wrap"
    >
      <XStack alignItems="center" gap="$3">
        <XStack
          role="button"
          aria-label="Previous week"
          aria-disabled={atFirst}
          tabIndex={atFirst ? -1 : 0}
          width={32}
          height={32}
          borderRadius="$3"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          justifyContent="center"
          alignItems="center"
          opacity={atFirst ? 0.4 : 1}
          hoverStyle={atFirst ? undefined : { backgroundColor: '$gray3' }}
          pressStyle={atFirst ? undefined : { scale: 0.95 }}
          onPress={
            atFirst ? undefined : () => onWeekChange(Math.max(1, week - 1))
          }
        >
          <ChevronLeft size={16} color="var(--color)" />
        </XStack>

        <YStack>
          <XStack alignItems="center" gap="$2">
            <Text fontSize="$5" fontWeight="700" color="$color">
              Week {week}
            </Text>
            <XStack
              paddingHorizontal="$2"
              paddingVertical="$0.5"
              borderRadius="$10"
              borderWidth={1}
              backgroundColor={chip.bg}
              borderColor={chip.border}
            >
              <Text
                fontSize="$1"
                fontWeight="700"
                color={chip.text}
                letterSpacing={0.5}
              >
                {chip.label}
              </Text>
            </XStack>
          </XStack>
        </YStack>

        <XStack
          role="button"
          aria-label="Next week"
          aria-disabled={atLast}
          tabIndex={atLast ? -1 : 0}
          width={32}
          height={32}
          borderRadius="$3"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          justifyContent="center"
          alignItems="center"
          opacity={atLast ? 0.4 : 1}
          hoverStyle={atLast ? undefined : { backgroundColor: '$gray3' }}
          pressStyle={atLast ? undefined : { scale: 0.95 }}
          onPress={
            atLast
              ? undefined
              : () => onWeekChange(Math.min(totalWeeks, week + 1))
          }
        >
          <ChevronRight size={16} color="var(--color)" />
        </XStack>
      </XStack>

      {!isCurrent && (
        <Text
          role="button"
          aria-label="Reset to current week"
          tabIndex={0}
          fontSize="$2"
          fontWeight="600"
          color="$brandGoldLight"
          hoverStyle={{ color: '$brandGold' }}
          onPress={onResetToCurrent}
        >
          Reset to Current
        </Text>
      )}
    </XStack>
  );
}
