import React, { useEffect, useMemo, useState } from 'react';
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
import { Chip } from '@legacy-sports/shared-components';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  type GetTeamMembersQuery,
  type LeaguePositionFragment,
  useGetTeamMembersQuery,
} from '@legacy-sports/graphql';
import { deriveFootballSlotOrder } from '@legacy-sports/utils';
import { PremiumGate } from '../../../features/subscription/PremiumGate';
import { useHasEntitlement } from '../../../features/subscription/useSubscription';

type TeamMember = NonNullable<
  NonNullable<GetTeamMembersQuery['teamMembers']>[number]
>;

const BENCH_SLOT = 'BN';

const DEFENSIVE_FORMAT_LABELS: Record<string, string> = {
  idp: 'IDP League (Individual Defensive Players)',
  dst: 'DST League (Team Defense / Special Teams)',
};

/**
 * Returns the display label for a league's defensive scoring format,
 * so managers can tell at a glance why their roster shows DST vs.
 * DL/LB/DB slots (LS-6453). Defaults to the DST label when unset.
 */
export function getDefensiveFormatLabel(
  defensiveFormat: string | null | undefined,
): string {
  const label = DEFENSIVE_FORMAT_LABELS[defensiveFormat ?? 'dst'];
  return label ?? DEFENSIVE_FORMAT_LABELS.dst;
}

const SLOT_LABELS: Record<string, string> = {
  QB: 'Quarterback',
  SFLEX: 'Superflex',
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
  readonly rosterSlots?: readonly (LeaguePositionFragment | null)[];
  /** League's defensive scoring format ('dst' or 'idp'), used only for the
   *  display label (LS-6453) — slot order itself is derived dynamically
   *  from `rosterSlots`, not from this value. */
  readonly defensiveFormat?: string | null;
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

/** A single displayed roster card: either a specific configured league position, or a generic placeholder for a position type the league didn't configure at all. */
export interface RosterRenderSlot {
  /** Unique key for this card — shared with other same-type slots only when the league has exactly one configured instance of that type. */
  readonly key: string;
  /** The position type this card displays (e.g. 'QB', 'FLEX'). */
  readonly type: string;
  /** The league's configured slot id for this card, when one exists. Undefined for a type the league didn't configure at all. */
  readonly slotId?: number;
}

/**
 * Builds the ordered list of roster cards to render (LS-6449).
 *
 * Renders one card per slot the league *actually configured* in `rosterSlots`
 * (`league_positions`) — so a league with two QB slots gets two independent
 * QB cards, each with its own empty/filled state, instead of one merged QB
 * bucket that hides which specific slot is unfilled. A position type with no
 * configured slots at all still gets a single generic placeholder card so
 * the roster grid stays complete for that `defensiveFormat`.
 */
export function buildRenderSlots(
  slotOrder: readonly string[],
  rosterSlots: readonly (LeaguePositionFragment | null)[],
): RosterRenderSlot[] {
  const renderSlots: RosterRenderSlot[] = [];

  for (const type of slotOrder) {
    if (type === 'BN') continue;

    const configured = rosterSlots.filter(
      (slot): slot is LeaguePositionFragment =>
        slot?.positionType === type && slot.id != null,
    );

    if (configured.length === 0) {
      renderSlots.push({ key: type, type });
      continue;
    }

    for (const slot of configured) {
      renderSlots.push({
        key: configured.length > 1 ? `${type}-${slot.id}` : type,
        type,
        slotId: slot.id ?? undefined,
      });
    }
  }

  renderSlots.push({ key: 'BN', type: 'BN' });
  return renderSlots;
}

/**
 * Assigns team members to the league's actual configured roster slots (LS-6449).
 *
 * Matches strictly by `member.positionId === slot.slotId` — a member whose
 * positionId doesn't resolve to any currently configured slot (stale id,
 * null, or a type the league never configured) is benched rather than
 * guessed at from eligibility, so a genuinely unfilled slot is never
 * confused with one that's merely mismatched.
 */
export function groupMembersBySlot(
  renderSlots: readonly RosterRenderSlot[],
  members: readonly TeamMember[],
): Record<string, TeamMember[]> {
  const groups: Record<string, TeamMember[]> = {};
  for (const slot of renderSlots) groups[slot.key] = [];

  for (const member of members) {
    const target =
      member.positionId != null
        ? renderSlots.find((slot) => slot.slotId === member.positionId)
        : undefined;

    if (target) {
      groups[target.key]?.push(member);
    } else {
      groups['BN']?.push(member);
    }
  }

  return groups;
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
    rosterSlots = [],
    byeWeeksByTeam,
    currentWeek,
    defensiveFormat,
  } = props;

  const { data, loading, error } = useGetTeamMembersQuery({
    variables: { teamId },
  });

  // LS-6450: advanced roster filters (premium). Only "hide players on bye"
  // ships in this pass — it reuses the bye-week data this screen already
  // has (LS-6430). Injury-status and NFL-game-start-time filters were also
  // suggested on the ticket but have no backing field on `FootballPlayer`
  // yet (no `injuryStatus`, no per-player kickoff time) — confirmed out of
  // scope entirely per LS-6442's premium-parity investigation ("injury/IR
  // features do not exist on this historical-data platform"), so they're
  // left as a follow-up for game-start-time only, rather than faked from
  // unrelated data.
  const [hideByeWeekPlayers, setHideByeWeekPlayers] = useState(false);
  const hasAdvancedFilters = useHasEntitlement(
    ENTITLEMENTS.advanced_search_filters,
  );

  useEffect(() => {
    if (error) {
      LOGGER.error('Failed to load roster', error, { teamId });
    }
  }, [error, teamId]);

  const slotOrder = useMemo(
    () => [...deriveFootballSlotOrder(rosterSlots), BENCH_SLOT],
    [rosterSlots],
  );

  const renderSlots = useMemo(
    () => buildRenderSlots(slotOrder, rosterSlots),
    [slotOrder, rosterSlots],
  );

  const grouped = useMemo(() => {
    const members = data?.teamMembers ?? [];
    const visibleMembers =
      hasAdvancedFilters && hideByeWeekPlayers
        ? members.filter(
            (member) => !isMemberOnBye(member, byeWeeksByTeam, currentWeek),
          )
        : members;
    return groupMembersBySlot(renderSlots, visibleMembers);
  }, [
    data,
    renderSlots,
    hasAdvancedFilters,
    hideByeWeekPlayers,
    byeWeeksByTeam,
    currentWeek,
  ]);

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
        <XStack
          testID="roster-defensive-format-badge"
          alignSelf="flex-start"
          paddingHorizontal="$2.5"
          paddingVertical="$1.5"
          borderRadius="$10"
          backgroundColor="$surfaceInteractive"
        >
          <Text fontSize="$2" fontWeight="600" color="$color12">
            {getDefensiveFormatLabel(defensiveFormat)}
          </Text>
        </XStack>
        {currentWeek != null && (
          <PremiumGate
            isPremium={hasAdvancedFilters}
            featureName="Roster Filters"
            featureDescription="Filter your roster by bye week and other advanced criteria."
          >
            <XStack
              testID="roster-filters"
              paddingHorizontal="$1"
              alignItems="center"
              gap="$2"
            >
              <Text fontSize="$2" color="$gray9">
                Filters:
              </Text>
              <Chip
                label="Hide bye-week players"
                tone="gold"
                selected={hideByeWeekPlayers}
                labelTestID="hide-bye-week-filter-chip"
                onPress={() => setHideByeWeekPlayers((prev) => !prev)}
              />
            </XStack>
          </PremiumGate>
        )}
        {renderSlots.map((slot) => {
          const members = grouped[slot.key] ?? [];
          return (
            <Card
              key={slot.key}
              testID={`${slot.key.toLowerCase()}-card`}
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
                  {slot.type}
                </Text>
                <Text fontSize="$2" color="$gray9" flex={1}>
                  {SLOT_LABELS[slot.type] ?? slot.type}
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
