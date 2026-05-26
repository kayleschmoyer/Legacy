import React, { useEffect, useMemo } from 'react';
import {
  Card,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  type GetTeamMembersQuery,
  useGetTeamMembersQuery,
} from '../../../api/db/graphql.generated';

type TeamMember = NonNullable<
  NonNullable<GetTeamMembersQuery['teamMembers']>[number]
>;

const DST_SLOT_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DST',
  'BN',
] as const;

const IDP_SLOT_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX',
  'K',
  'DL',
  'LB',
  'DB',
  'BN',
] as const;

const SLOT_LABELS: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running Back',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  FLEX: 'Flex',
  K: 'Kicker',
  DST: 'Defense / Special Teams',
  DL: 'Defensive Lineman',
  LB: 'Linebacker',
  DB: 'Defensive Back',
  BN: 'Bench',
};

interface FootballLeagueRosterScreenProps {
  readonly teamId: number;
  readonly defensiveFormat?: string | null;
}

/**
 * Returns the ordered list of roster position slots for the given defensive format.
 * Uses IDP slots (DL, LB, DB, …) for IDP leagues; DST slot for all others.
 *
 * @param defensiveFormat - 'idp' for individual defensive players, or 'dst'/null for team defense.
 * @returns Ordered array of position slot labels for the roster grid.
 */
export function getSlotOrder(
  defensiveFormat: string | null | undefined,
): readonly string[] {
  return defensiveFormat === 'idp' ? IDP_SLOT_ORDER : DST_SLOT_ORDER;
}

/**
 * Returns the display name for a roster member.
 * Concatenates first and last name; falls back to 'Unknown Player' when either is absent.
 *
 * @param member - A team member object containing a nested player record.
 * @returns Full player name string, or 'Unknown Player' if the player data is missing.
 */
export function getPlayerLabel(member: Pick<TeamMember, 'player'>): string {
  const p = member.player;
  if (!p) return 'Unknown Player';
  return (
    [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown Player'
  );
}

/**
 * Returns the primary position badge label for a roster member.
 * Uses the first entry in `eligiblePositions`; falls back to '—' when none are defined.
 *
 * @param member - A team member object containing a nested player record.
 * @returns Position abbreviation string (e.g. 'QB', 'WR'), or '—' if positions are unavailable.
 */
export function getPositionBadge(member: Pick<TeamMember, 'player'>): string {
  const positions = member.player?.eligiblePositions;
  if (!positions || positions.length === 0) return '—';
  return positions[0] ?? '—';
}

export function FootballLeagueRosterScreen(
  props: FootballLeagueRosterScreenProps,
): React.JSX.Element {
  const { teamId, defensiveFormat } = props;

  const { data, loading, error } = useGetTeamMembersQuery({
    variables: { teamId },
  });

  useEffect(() => {
    if (error) {
      LOGGER.error('Failed to load roster', error, { teamId });
    }
  }, [error, teamId]);

  const slotOrder = useMemo(
    () => getSlotOrder(defensiveFormat),
    [defensiveFormat],
  );

  const grouped = useMemo(() => {
    const members = data?.teamMembers ?? [];
    const groups: Record<string, TeamMember[]> = {};
    for (const slot of slotOrder) groups[slot] = [];

    for (const member of members) {
      const positions = member.player?.eligiblePositions ?? [];
      let assigned = false;
      for (const slot of slotOrder) {
        if (slot !== 'BN' && positions.includes(slot)) {
          groups[slot]?.push(member);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        groups['BN']?.push(member);
      }
    }

    return groups;
  }, [data, slotOrder]);

  if (error) {
    return (
      <Card
        backgroundColor="$red2"
        borderColor="$red7"
        borderWidth={1}
        padding="$3"
        borderRadius="$4"
      >
        <Text fontSize="$3" color="$red11">
          Failed to load roster.
        </Text>
      </Card>
    );
  }

  if (loading) {
    return (
      <YStack alignItems="center" padding="$6" gap="$3">
        <Spinner size="large" color="$blue9" />
        <Text fontSize="$3" color="$gray9">
          Loading roster…
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <YStack gap="$3" paddingBottom="$8">
        {slotOrder.map((slot) => {
          const members = grouped[slot] ?? [];
          return (
            <Card
              key={slot}
              bordered
              backgroundColor="$background"
              borderRadius="$4"
              overflow="hidden"
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                backgroundColor="$backgroundHover"
                alignItems="center"
                gap="$2"
              >
                <Text fontSize="$3" fontWeight="700" color="$color12">
                  {slot}
                </Text>
                <Text fontSize="$2" color="$gray9" flex={1}>
                  {SLOT_LABELS[slot] ?? slot}
                </Text>
                <Text fontSize="$2" color="$gray8">
                  {members.length}
                </Text>
              </XStack>

              <Separator />

              {members.length === 0 ? (
                <Text
                  fontSize="$2"
                  color="$gray7"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  fontStyle="italic"
                >
                  Empty slot
                </Text>
              ) : (
                <YStack>
                  {members.map((member, idx) => (
                    <XStack
                      key={String(member.id ?? member.playerId ?? idx)}
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      alignItems="center"
                      gap="$2"
                    >
                      <YStack
                        width={28}
                        height={28}
                        borderRadius="$2"
                        backgroundColor="$blue3"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize="$1" fontWeight="700" color="$blue10">
                          {getPositionBadge(member)}
                        </Text>
                      </YStack>
                      <Text fontSize="$3" color="$color12" flex={1}>
                        {getPlayerLabel(member)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              )}
            </Card>
          );
        })}
      </YStack>
    </ScrollView>
  );
}
