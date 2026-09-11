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
  type LeaguePositionFragment,
  useGetTeamMembersQuery,
} from '@legacy-sports/graphql';

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
  'IDP_FLEX',
  'ST',
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
  IDP_FLEX: 'IDP Flex',
  ST: 'Special Teams',
  BN: 'Bench',
};

interface FootballLeagueRosterScreenProps {
  readonly teamId: number;
  readonly defensiveFormat?: string | null;
  readonly rosterSlots?: readonly (LeaguePositionFragment | null)[];
  /**
   * Per-NFL-team bye week for the league's active season, keyed by team
   * abbreviation (LS-6430). Paired with `currentWeek` to flag roster members
   * whose team is on bye with a BYE badge.
   */
  readonly byeWeeksByTeam?: Readonly<Record<string, number>>;
  /** The league's active/viewed week. Compared against `byeWeeksByTeam` (LS-6430). */
  readonly currentWeek?: number | null;
}

/**
 * True when the given roster member's NFL team has no game this week
 * (LS-6430). Mirrors the RosterBoard bye-week check (LS-6334).
 */
export function isMemberOnBye(
  member: Pick<TeamMember, 'player'>,
  byeWeeksByTeam: Readonly<Record<string, number>> | undefined,
  currentWeek: number | null | undefined,
): boolean {
  const nflTeam = member.player?.nflTeam;
  if (!nflTeam || currentWeek == null) return false;
  return byeWeeksByTeam?.[nflTeam] === currentWeek;
}

/**
 * Builds a lookup from a league's roster-slot id to its position type (e.g. 'QB', 'FLEX').
 * Used to resolve a team member's assigned `positionId` to a display slot.
 */
function buildPositionIdToSlot(
  rosterSlots: readonly (LeaguePositionFragment | null)[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const slot of rosterSlots) {
    if (slot?.id != null && slot.positionType) {
      map.set(slot.id, slot.positionType);
    }
  }
  return map;
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
  const {
    teamId,
    defensiveFormat,
    rosterSlots = [],
    byeWeeksByTeam,
    currentWeek,
  } = props;

  const { data, loading, error } = useGetTeamMembersQuery({
    variables: { teamId },
  });

  const positionIdToSlot = useMemo(
    () => buildPositionIdToSlot(rosterSlots),
    [rosterSlots],
  );

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
      const assignedSlot =
        member.positionId != null
          ? positionIdToSlot.get(member.positionId)
          : undefined;

      if (assignedSlot && groups[assignedSlot]) {
        groups[assignedSlot]?.push(member);
      } else {
        groups['BN']?.push(member);
      }
    }

    return groups;
  }, [data, slotOrder, positionIdToSlot]);

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
        <Spinner size="large" color="$brandNavyLight" />
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
              testID={`${slot.toLowerCase()}-card`}
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
                        backgroundColor="$surfaceInteractive"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text
                          fontSize="$1"
                          fontWeight="700"
                          color="$brandGoldLight"
                        >
                          {getPositionBadge(member)}
                        </Text>
                      </YStack>
                      <Text fontSize="$3" color="$color12" flex={1}>
                        {getPlayerLabel(member)}
                      </Text>
                      {isMemberOnBye(member, byeWeeksByTeam, currentWeek) && (
                        <XStack
                          paddingHorizontal="$2"
                          paddingVertical="$1"
                          borderRadius="$10"
                          backgroundColor="$red10"
                        >
                          <Text fontSize="$1" fontWeight="700" color="white">
                            BYE
                          </Text>
                        </XStack>
                      )}
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
