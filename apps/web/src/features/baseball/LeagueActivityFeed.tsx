import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  ArrowLeftRight,
  CalendarCheck,
  ChevronRight,
  Clock,
  Filter,
  Play,
  Shield,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Zap,
} from '@tamagui/lucide-icons';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityType =
  | 'all'
  | 'trade'
  | 'waiver'
  | 'draft_pick'
  | 'lineup_change'
  | 'roster_move'
  | 'commissioner'
  | 'matchup';

interface ActivityItem {
  id: string;
  type: Exclude<ActivityType, 'all'>;
  icon: React.ReactNode;
  title: string;
  detail: string;
  /** ISO timestamp string */
  isoDate: string;
  accentColor: string;
  /** Optional href-like route for click-through */
  linkTo?: string;
}

export interface LeagueActivityFeedProps {
  leagueId: number;
  draftStatus: string;
  currentMatchup?: number | null;
  teamCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/** Returns an ISO string for `hoursAgo` hours in the past */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

const TYPE_LABELS: Record<Exclude<ActivityType, 'all'>, string> = {
  trade: 'Trades',
  waiver: 'Waivers',
  draft_pick: 'Draft',
  lineup_change: 'Lineup',
  roster_move: 'Roster',
  commissioner: 'Commissioner',
  matchup: 'Matchups',
};

const FILTER_TABS: { type: ActivityType; label: string }[] = [
  { type: 'all', label: 'All' },
  { type: 'trade', label: 'Trades' },
  { type: 'waiver', label: 'Waivers' },
  { type: 'draft_pick', label: 'Draft' },
  { type: 'lineup_change', label: 'Lineup' },
  { type: 'roster_move', label: 'Roster' },
  { type: 'commissioner', label: 'Commissioner' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LeagueActivityFeed — Comprehensive league activity timeline showing trades,
 * waiver claims, draft picks, lineup changes, roster moves, and commissioner
 * actions. Filterable by activity type with relative timestamps.
 *
 * Activities are synthesized from league state. A future iteration will consume
 * a real league transaction log API (see LS-293).
 */
export function LeagueActivityFeed({
  leagueId,
  draftStatus,
  currentMatchup,
  teamCount,
}: LeagueActivityFeedProps): React.JSX.Element {
  const [activeFilter, setActiveFilter] = useState<ActivityType>('all');

  // Build a comprehensive list of activities that reflect the current league
  // state. In production these will come from the transaction log API.
  const activities: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = [];
    const isDraftDone = draftStatus === 'completed';
    const isDraftLive = draftStatus === 'in-progress';
    const isDraftQueued = draftStatus === 'queued';
    const week = currentMatchup ?? 0;

    // ── Commissioner actions ────────────────────────────────────────────────
    items.push({
      id: 'comm-league-created',
      type: 'commissioner',
      icon: <Shield size={16} color={BRAND_GOLD_LIGHT} />,
      title: 'League created',
      detail: `Commissioner set up the league with ${teamCount} teams.`,
      isoDate: hoursAgo(168 + teamCount * 2),
      accentColor: BRAND_GOLD_LIGHT,
      linkTo: `/leagues/${leagueId}/settings`,
    });

    items.push({
      id: 'comm-teams-joined',
      type: 'commissioner',
      icon: <Users size={16} color={BRAND_GOLD_LIGHT} />,
      title: `${teamCount} manager${teamCount !== 1 ? 's' : ''} joined`,
      detail:
        teamCount < 6
          ? 'Still waiting on managers — share your invite link!'
          : 'Full complement of managers are ready to compete.',
      isoDate: hoursAgo(150),
      accentColor: BRAND_GOLD_LIGHT,
      linkTo: `/leagues/${leagueId}/settings`,
    });

    if (isDraftQueued || isDraftLive || isDraftDone) {
      items.push({
        id: 'comm-draft-scheduled',
        type: 'commissioner',
        icon: <Shield size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Draft scheduled',
        detail: 'Commissioner locked the draft settings and set a start time.',
        isoDate: hoursAgo(96),
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${leagueId}/draft`,
      });
    }

    // ── Draft status ────────────────────────────────────────────────────────
    if (isDraftLive) {
      items.push({
        id: 'draft-live',
        type: 'draft_pick',
        icon: <Zap size={16} color={BRAND_NAVY_LIGHT} />,
        title: 'Draft is live!',
        detail: 'Managers are making their picks right now.',
        isoDate: hoursAgo(0.1),
        accentColor: BRAND_NAVY_LIGHT,
        linkTo: `/leagues/${leagueId}/draft`,
      });
    } else if (isDraftQueued) {
      items.push({
        id: 'draft-queued',
        type: 'draft_pick',
        icon: <CalendarCheck size={16} color="rgb(245, 158, 11)" />,
        title: 'Draft queued',
        detail: 'The draft is scheduled and ready to start — check your queue.',
        isoDate: hoursAgo(80),
        accentColor: '$amber11',
        linkTo: `/leagues/${leagueId}/draft`,
      });
    } else if (!isDraftDone) {
      items.push({
        id: 'draft-pending',
        type: 'draft_pick',
        icon: <CalendarCheck size={16} color="rgb(148, 163, 184)" />,
        title: 'Waiting for draft',
        detail:
          'Commissioner needs to start the draft before the season begins.',
        isoDate: hoursAgo(120),
        accentColor: '$gray11',
        linkTo: `/leagues/${leagueId}/draft`,
      });
    }

    if (isDraftDone) {
      items.push({
        id: 'draft-complete',
        type: 'draft_pick',
        icon: <Trophy size={16} color={BRAND_GOLD} />,
        title: 'Draft completed',
        detail: `All ${teamCount} teams filled their rosters. Season is underway!`,
        isoDate: hoursAgo(72),
        accentColor: BRAND_GOLD,
        linkTo: `/leagues/${leagueId}/draft`,
      });

      // Simulate notable draft picks
      items.push({
        id: 'draft-pick-1',
        type: 'draft_pick',
        icon: <Trophy size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Round 1, Pick 1 · Shohei Ohtani',
        detail:
          'The Sluggers selected Shohei Ohtani with the 1st overall pick.',
        isoDate: hoursAgo(73),
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${leagueId}/draft`,
      });
      items.push({
        id: 'draft-pick-2',
        type: 'draft_pick',
        icon: <Trophy size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Round 1, Pick 2 · Mookie Betts',
        detail: 'The Bats selected Mookie Betts with the 2nd overall pick.',
        isoDate: hoursAgo(73.1),
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${leagueId}/draft`,
      });
    }

    // ── Matchup events ──────────────────────────────────────────────────────
    if (week > 0 && isDraftDone) {
      items.push({
        id: 'matchup-active',
        type: 'matchup',
        icon: <Play size={16} color="rgb(34, 197, 94)" />,
        title: `Week ${week} matchups are live`,
        detail: 'Check your lineup — scoring is in progress.',
        isoDate: hoursAgo(2),
        accentColor: '$green11',
        linkTo: `/leagues/${leagueId}/matchups`,
      });

      if (week > 1) {
        items.push({
          id: 'matchup-last-week',
          type: 'matchup',
          icon: <CalendarCheck size={16} color="rgb(34, 197, 94)" />,
          title: `Week ${week - 1} results finalized`,
          detail: 'Final scores have been locked and standings updated.',
          isoDate: hoursAgo(14 * 24),
          accentColor: '$green11',
          linkTo: `/leagues/${leagueId}/standings`,
        });
      }
    }

    // ── Trades ──────────────────────────────────────────────────────────────
    if (isDraftDone && week >= 2) {
      items.push({
        id: 'trade-accepted-1',
        type: 'trade',
        icon: <ArrowLeftRight size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Trade accepted · Week 2',
        detail:
          'The Sluggers traded Paul Goldschmidt to The Bats for Yordan Alvarez.',
        isoDate: hoursAgo(10 * 24),
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${leagueId}/trades`,
      });
    }
    if (isDraftDone && week >= 3) {
      items.push({
        id: 'trade-accepted-2',
        type: 'trade',
        icon: <ArrowLeftRight size={16} color={BRAND_GOLD_LIGHT} />,
        title: 'Trade accepted · Week 3',
        detail:
          'Rockets traded two players to Aces in exchange for Max Fried and a waiver priority.',
        isoDate: hoursAgo(3 * 24),
        accentColor: BRAND_GOLD_LIGHT,
        linkTo: `/leagues/${leagueId}/trades`,
      });
    }

    // ── Waiver claims ───────────────────────────────────────────────────────
    if (isDraftDone && week >= 1) {
      items.push({
        id: 'waiver-claim-1',
        type: 'waiver',
        icon: <UserCheck size={16} color="rgb(168, 85, 247)" />,
        title: 'Waiver claim processed',
        detail: 'The Aces claimed Luis Castillo (SP) — dropped Marcus Stroman.',
        isoDate: hoursAgo(5 * 24),
        accentColor: '$purple11',
        linkTo: `/leagues/${leagueId}/waivers`,
      });
    }
    if (isDraftDone && week >= 2) {
      items.push({
        id: 'waiver-claim-2',
        type: 'waiver',
        icon: <UserCheck size={16} color="rgb(168, 85, 247)" />,
        title: 'Waiver claim processed',
        detail: 'The Rockets claimed Jazz Chisholm Jr. (2B/OF) off waivers.',
        isoDate: hoursAgo(12 * 24),
        accentColor: '$purple11',
        linkTo: `/leagues/${leagueId}/waivers`,
      });
    }

    // ── Roster moves ────────────────────────────────────────────────────────
    if (isDraftDone && week >= 1) {
      items.push({
        id: 'roster-add-1',
        type: 'roster_move',
        icon: <UserPlus size={16} color="rgb(34, 197, 94)" />,
        title: 'Free agent pickup',
        detail:
          'The Sluggers added Ryan Pressly (RP) from the free agent pool.',
        isoDate: hoursAgo(7 * 24),
        accentColor: '$green11',
        linkTo: `/leagues/${leagueId}/roster`,
      });
      items.push({
        id: 'roster-drop-1',
        type: 'roster_move',
        icon: <UserMinus size={16} color="rgb(239, 68, 68)" />,
        title: 'Player dropped',
        detail:
          'The Sluggers dropped Lucas Giolito (SP) — placed on injured list.',
        isoDate: hoursAgo(7 * 24 + 1),
        accentColor: '$red11',
        linkTo: `/leagues/${leagueId}/roster`,
      });
    }

    // ── Lineup changes ──────────────────────────────────────────────────────
    if (isDraftDone && week >= 1) {
      items.push({
        id: 'lineup-1',
        type: 'lineup_change',
        icon: <Users size={16} color="rgb(100, 116, 139)" />,
        title: `Lineups set for Week ${week > 0 ? week : 1}`,
        detail:
          'Multiple managers updated their active rosters before the deadline.',
        isoDate: hoursAgo(48),
        accentColor: '$gray11',
        linkTo: `/leagues/${leagueId}/lineup`,
      });
    }

    // Sort newest first
    return items.sort(
      (a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime(),
    );
  }, [draftStatus, currentMatchup, teamCount, leagueId]);

  const filtered = useMemo(
    () =>
      activeFilter === 'all'
        ? activities
        : activities.filter((a) => a.type === activeFilter),
    [activities, activeFilter],
  );

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      padding="$5"
    >
      {/* Header */}
      <XStack alignItems="center" gap="$2" marginBottom="$4">
        <Clock size={18} color="var(--color)" />
        <Text fontSize="$5" fontWeight="700" color="$color" flex={1}>
          League Activity
        </Text>
        <Filter size={14} color="var(--textMuted)" />
      </XStack>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        marginBottom="$4"
      >
        <XStack gap="$2" paddingBottom="$1">
          {FILTER_TABS.map(({ type, label }) => {
            const isActive = activeFilter === type;
            const count =
              type === 'all'
                ? activities.length
                : activities.filter((a) => a.type === type).length;
            if (count === 0 && type !== 'all') return null;
            return (
              <Button
                key={type}
                size="$2"
                borderRadius="$10"
                paddingHorizontal="$3"
                backgroundColor={
                  isActive
                    ? withAlpha(BRAND_NAVY_LIGHT, 0.18)
                    : '$surfaceSubtle'
                }
                borderColor={isActive ? BRAND_NAVY_LIGHT : '$outlineSubtle'}
                borderWidth={1}
                onPress={() => {
                  setActiveFilter(type);
                }}
              >
                <Text
                  fontSize="$2"
                  fontWeight={isActive ? '700' : '500'}
                  color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                >
                  {label}
                  {count > 0 ? ` · ${count}` : ''}
                </Text>
              </Button>
            );
          })}
        </XStack>
      </ScrollView>

      {/* Activity list */}
      <YStack gap="$1">
        {filtered.length === 0 ? (
          <YStack paddingVertical="$4" alignItems="center">
            <Text fontSize="$3" color="$textMuted">
              No{' '}
              {activeFilter === 'all'
                ? ''
                : `${TYPE_LABELS[activeFilter].toLowerCase()} `}
              activity yet.
            </Text>
          </YStack>
        ) : (
          filtered.map((activity, idx) => (
            <React.Fragment key={activity.id}>
              <XStack
                gap="$3"
                paddingVertical="$3"
                alignItems="flex-start"
                pressStyle={{ opacity: 0.75 }}
                cursor={activity.linkTo ? 'pointer' : 'default'}
              >
                {/* Icon bubble */}
                <YStack
                  width={32}
                  height={32}
                  borderRadius={16}
                  backgroundColor="$surfaceSubtle"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  marginTop="$0.5"
                >
                  {activity.icon}
                </YStack>

                {/* Content */}
                <YStack flex={1} gap="$1">
                  <XStack
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap="$2"
                  >
                    <Text
                      fontSize="$3"
                      fontWeight="600"
                      color="$color"
                      flex={1}
                      numberOfLines={2}
                    >
                      {activity.title}
                    </Text>
                    <XStack alignItems="center" gap="$1" flexShrink={0}>
                      <Text
                        fontSize="$1"
                        color="$textMuted"
                        textTransform="uppercase"
                        letterSpacing={0.5}
                      >
                        {formatRelativeDate(activity.isoDate)}
                      </Text>
                      {activity.linkTo ? (
                        <ChevronRight size={12} color="var(--textMuted)" />
                      ) : null}
                    </XStack>
                  </XStack>
                  <Text fontSize="$2" color="$textMuted" lineHeight="$3">
                    {activity.detail}
                  </Text>
                  {/* Type badge */}
                  <Text
                    fontSize="$1"
                    color={activity.accentColor}
                    fontWeight="600"
                    textTransform="uppercase"
                    letterSpacing={0.8}
                    marginTop="$0.5"
                  >
                    {TYPE_LABELS[activity.type]}
                  </Text>
                </YStack>
              </XStack>

              {idx < filtered.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginLeft={44} />
              )}
            </React.Fragment>
          ))
        )}
      </YStack>

      {/* Footer count */}
      {filtered.length > 0 && (
        <XStack
          justifyContent="center"
          marginTop="$3"
          paddingTop="$3"
          borderTopWidth={1}
          borderColor="$outlineSubtle"
        >
          <Text fontSize="$2" color="$textMuted">
            Showing {filtered.length} of {activities.length} event
            {activities.length !== 1 ? 's' : ''}
          </Text>
        </XStack>
      )}
    </Card>
  );
}
