import React, { useMemo } from 'react';
import {
  Button,
  Dialog,
  H3,
  H4,
  ScrollView,
  Spinner,
  Text,
  Tooltip,
  XStack,
  YStack,
} from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import { WHITE, withAlpha } from '../../constants/colors';
import { useGetAllPlayerSeasonStatsQuery } from '../../api/db/graphql.generated';
import { ipToDecimalInnings } from '../../lib/scoring/ipUtils';

export interface PlayerSeasonStatsModalProps {
  /** Player ID to load stats for */
  playerId: number | null;
  /** Player name to display in title */
  playerName: string;
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
}

interface SeasonRow {
  season: number;
  batting?: {
    games: number;
    pa: number;
    ab: number;
    h: number;
    hr: number;
    rbi: number;
    avg: string;
  };
  pitching?: {
    games: number;
    wins: number;
    losses: number;
    era: string;
    ip: number;
    so: number;
  };
  fielding?: {
    games: number;
    inn: number;
    po: number;
    a: number;
    e: number;
    position: string;
  };
}

/**
 * PositionDisplay - Shows positions with overflow (max 2 visible, rest on hover)
 */
function PositionDisplay({ positions }: { positions: string }) {
  const posArray = positions.split(',').map((p) => p.trim());

  if (posArray.length <= 2) {
    // Show all if 2 or fewer
    return (
      <Text fontSize="$3" fontWeight="600" color="$blue10">
        {positions}
      </Text>
    );
  }

  // Show first 2 and indicate more
  const visible = posArray.slice(0, 2).join(', ');
  const hidden = posArray.slice(2);

  return (
    <Tooltip placement="top">
      <Tooltip.Trigger>
        <XStack gap="$1" alignItems="center">
          <Text fontSize="$3" fontWeight="600" color="$blue10">
            {visible}
          </Text>
          <Text
            fontSize="$2"
            color="$gray10"
            fontWeight="500"
            backgroundColor="$gray4"
            paddingHorizontal="$1.5"
            paddingVertical="$0.5"
            borderRadius="$2"
          >
            +{hidden.length}
          </Text>
        </XStack>
      </Tooltip.Trigger>
      <Tooltip.Content
        enterStyle={{ x: 0, y: -5, opacity: 0, scale: 0.9 }}
        exitStyle={{ x: 0, y: -5, opacity: 0, scale: 0.9 }}
        scale={1}
        x={0}
        y={0}
        opacity={1}
        animation={[
          'quick',
          {
            opacity: {
              overshootClamping: true,
            },
          },
        ]}
      >
        <Tooltip.Arrow />
        <Text fontSize="$3" fontWeight="600" color="$blue11">
          All Positions: {positions}
        </Text>
      </Tooltip.Content>
    </Tooltip>
  );
}

/**
 * PlayerSeasonStatsModal - Modal showing season-by-season statistics for a player
 * Similar to the Jake Tonges modal in the design
 */
export function PlayerSeasonStatsModal({
  playerId,
  playerName,
  open,
  onOpenChange,
}: PlayerSeasonStatsModalProps) {
  LOGGER.debug('[PlayerSeasonStatsModal] Props:', {
    playerId,
    playerName,
    open,
  });

  // Query for all season stats for this player
  const { data, loading, error } = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: playerId ?? 0 },
    skip: !playerId || !open,
  });

  LOGGER.debug('[PlayerSeasonStatsModal] Query state:', {
    skip: !playerId || !open,
    loading,
    hasData: !!data,
    error: error?.message,
    battingCount: data?.playerSeasonBatting?.length,
    pitchingCount: data?.playerSeasonPitching?.length,
    fieldingCount: data?.playerSeasonFielding?.length,
  });

  // Transform data into season rows
  const seasonRows = useMemo((): SeasonRow[] => {
    if (!data) return [];

    const seasons = new Map<number, SeasonRow>();

    // Add batting stats
    data.playerSeasonBatting?.forEach(
      (batting: {
        season?: number | null;
        atBats?: number | null;
        hits?: number | null;
        games?: number | null;
        plateAppearances?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
      }) => {
        if (!batting?.season) return;

        const season: SeasonRow = seasons.get(batting.season) || {
          season: batting.season,
        };
        const ab = batting.atBats ?? 0;
        const h = batting.hits ?? 0;
        const avg = ab > 0 ? (h / ab).toFixed(3) : '.000';

        season.batting = {
          games: batting.games ?? 0,
          pa: batting.plateAppearances ?? 0,
          ab,
          h,
          hr: batting.homeRuns ?? 0,
          rbi: batting.rbi ?? 0,
          avg,
        };
        seasons.set(batting.season, season);
      },
    );

    // Add pitching stats
    data.playerSeasonPitching?.forEach(
      (pitching: {
        season?: number | null;
        inningsPitched?: number | null;
        earnedRuns?: number | null;
        games?: number | null;
        wins?: number | null;
        losses?: number | null;
        strikeouts?: number | null;
      }) => {
        if (!pitching?.season) return;

        const season: SeasonRow = seasons.get(pitching.season) || {
          season: pitching.season,
        };
        const ip = pitching.inningsPitched ?? 0;
        const er = pitching.earnedRuns ?? 0;
        const decimalInnings = ipToDecimalInnings(ip);
        const era =
          decimalInnings > 0 ? ((er * 9) / decimalInnings).toFixed(2) : '0.00';

        season.pitching = {
          games: pitching.games ?? 0,
          wins: pitching.wins ?? 0,
          losses: pitching.losses ?? 0,
          era,
          ip,
          so: pitching.strikeouts ?? 0,
        };
        seasons.set(pitching.season, season);
      },
    );

    // Add fielding stats (aggregate across multiple positions if player played multiple positions in a season)
    data.playerSeasonFielding?.forEach(
      (fielding: {
        season?: number | null;
        games?: number | null;
        inningsDefended?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        position?: string | null;
      }) => {
        if (!fielding?.season) return;

        const season: SeasonRow = seasons.get(fielding.season) || {
          season: fielding.season,
        };

        if (season.fielding) {
          // Player has multiple positions for this season - aggregate the stats
          season.fielding.games += fielding.games ?? 0;
          season.fielding.inn += fielding.inningsDefended ?? 0;
          season.fielding.po += fielding.putouts ?? 0;
          season.fielding.a += fielding.assists ?? 0;
          season.fielding.e += fielding.errors ?? 0;
          // Add position to the list if not already there
          const pos = fielding.position ?? '';
          if (pos && !season.fielding.position.includes(pos)) {
            season.fielding.position +=
              (season.fielding.position ? ', ' : '') + pos;
          }
        } else {
          // First position for this season
          season.fielding = {
            games: fielding.games ?? 0,
            inn: fielding.inningsDefended ?? 0,
            po: fielding.putouts ?? 0,
            a: fielding.assists ?? 0,
            e: fielding.errors ?? 0,
            position: fielding.position ?? '',
          };
        }

        seasons.set(fielding.season, season);
      },
    );

    // Sort by season descending (most recent first)
    return Array.from(seasons.values()).sort((a, b) => b.season - a.season);
  }, [data]);

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          bordered
          elevate
          key="content"
          animateOnly={['transform', 'opacity']}
          animation={[
            'quick',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          width="90%"
          maxWidth={900}
          maxHeight="85vh"
        >
          {/* Header */}
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            backgroundColor="$red10"
            borderTopLeftRadius="$4"
            borderTopRightRadius="$4"
            justifyContent="space-between"
            alignItems="center"
          >
            <YStack>
              <Text fontSize="$2" color="white" opacity={0.9}>
                Player Stats
              </Text>
              <H3 color="white" fontSize="$7" fontWeight="bold">
                {playerName}
              </H3>
            </YStack>
            <Dialog.Close asChild>
              <Button
                size="$3"
                circular
                icon={X}
                backgroundColor={withAlpha(WHITE, 0.2)}
                color="white"
                hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.3) }}
              />
            </Dialog.Close>
          </XStack>

          {/* Content */}
          <ScrollView maxHeight="calc(85vh - 120px)">
            <YStack padding="$4" space="$4">
              {loading && (
                <YStack alignItems="center" paddingVertical="$8">
                  <Spinner size="large" color="$blue10" />
                  <Text marginTop="$2" color="$gray11">
                    Loading season statistics...
                  </Text>
                </YStack>
              )}

              {error && (
                <YStack
                  backgroundColor="$red2"
                  padding="$4"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor="$red6"
                >
                  <Text color="$red11" fontWeight="600">
                    Error loading stats
                  </Text>
                  <Text color="$red10" fontSize="$2" marginTop="$1">
                    {error.message}
                  </Text>
                </YStack>
              )}

              {!loading && !error && seasonRows.length === 0 && (
                <YStack
                  alignItems="center"
                  paddingVertical="$8"
                  backgroundColor="$gray2"
                  borderRadius="$3"
                >
                  <Text color="$gray11" fontSize="$4">
                    No season statistics found
                  </Text>
                </YStack>
              )}

              {!loading && !error && seasonRows.length > 0 && (
                <>
                  {/* Batting Stats Section */}
                  {seasonRows.some((s) => s.batting) && (
                    <YStack>
                      <H4 color="$blue11" marginBottom="$2">
                        Batting Statistics
                      </H4>
                      <YStack
                        backgroundColor="$background"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$borderColor"
                        overflow="hidden"
                      >
                        {/* Header */}
                        <XStack
                          backgroundColor="$blue3"
                          paddingVertical="$2"
                          paddingHorizontal="$3"
                          borderBottomWidth={1}
                          borderBottomColor="$borderColor"
                        >
                          <Text
                            width={70}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            YEAR
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            G
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            PA
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            AB
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            H
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            HR
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            RBI
                          </Text>
                          <Text
                            width={60}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            AVG
                          </Text>
                        </XStack>
                        {/* Rows */}
                        {seasonRows
                          .filter((s) => s.batting)
                          .map((season, idx) => (
                            <XStack
                              key={season.season}
                              paddingVertical="$2.5"
                              paddingHorizontal="$3"
                              backgroundColor={
                                idx % 2 === 0 ? '$background' : '$gray1'
                              }
                              hoverStyle={{ backgroundColor: '$gray2' }}
                            >
                              <Text width={70} fontSize="$3" fontWeight="600">
                                {season.season}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.games}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.pa}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.ab}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.h}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.hr}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.batting?.rbi}
                              </Text>
                              <Text width={60} fontSize="$3" fontWeight="600">
                                {season.batting?.avg}
                              </Text>
                            </XStack>
                          ))}
                      </YStack>
                    </YStack>
                  )}

                  {/* Pitching Stats Section */}
                  {seasonRows.some((s) => s.pitching) && (
                    <YStack>
                      <H4 color="$blue11" marginBottom="$2">
                        Pitching Statistics
                      </H4>
                      <YStack
                        backgroundColor="$background"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$borderColor"
                        overflow="hidden"
                      >
                        {/* Header */}
                        <XStack
                          backgroundColor="$blue3"
                          paddingVertical="$2"
                          paddingHorizontal="$3"
                          borderBottomWidth={1}
                          borderBottomColor="$borderColor"
                        >
                          <Text
                            width={70}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            YEAR
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            G
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            W
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            L
                          </Text>
                          <Text
                            width={60}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            ERA
                          </Text>
                          <Text
                            width={60}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            IP
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            SO
                          </Text>
                        </XStack>
                        {/* Rows */}
                        {seasonRows
                          .filter((s) => s.pitching)
                          .map((season, idx) => (
                            <XStack
                              key={season.season}
                              paddingVertical="$2.5"
                              paddingHorizontal="$3"
                              backgroundColor={
                                idx % 2 === 0 ? '$background' : '$gray1'
                              }
                              hoverStyle={{ backgroundColor: '$gray2' }}
                            >
                              <Text width={70} fontSize="$3" fontWeight="600">
                                {season.season}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.pitching?.games}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.pitching?.wins}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.pitching?.losses}
                              </Text>
                              <Text width={60} fontSize="$3" fontWeight="600">
                                {season.pitching?.era}
                              </Text>
                              <Text width={60} fontSize="$3">
                                {season.pitching?.ip.toFixed(1)}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.pitching?.so}
                              </Text>
                            </XStack>
                          ))}
                      </YStack>
                    </YStack>
                  )}

                  {/* Fielding Stats Section */}
                  {seasonRows.some((s) => s.fielding) && (
                    <YStack>
                      <H4 color="$blue11" marginBottom="$2">
                        Fielding Statistics
                      </H4>
                      <YStack
                        backgroundColor="$background"
                        borderRadius="$3"
                        borderWidth={1}
                        borderColor="$borderColor"
                        overflow="hidden"
                      >
                        {/* Header */}
                        <XStack
                          backgroundColor="$blue3"
                          paddingVertical="$2"
                          paddingHorizontal="$3"
                          borderBottomWidth={1}
                          borderBottomColor="$borderColor"
                        >
                          <Text
                            width={70}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            YEAR
                          </Text>
                          <Text
                            width={100}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            POS
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            G
                          </Text>
                          <Text
                            width={60}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            INN
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            PO
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            A
                          </Text>
                          <Text
                            width={50}
                            fontSize="$2"
                            fontWeight="bold"
                            color="$blue11"
                          >
                            E
                          </Text>
                        </XStack>
                        {/* Rows */}
                        {seasonRows
                          .filter((s) => s.fielding)
                          .map((season, idx) => (
                            <XStack
                              key={season.season}
                              paddingVertical="$2.5"
                              paddingHorizontal="$3"
                              backgroundColor={
                                idx % 2 === 0 ? '$background' : '$gray1'
                              }
                              hoverStyle={{ backgroundColor: '$gray2' }}
                            >
                              <Text width={70} fontSize="$3" fontWeight="600">
                                {season.season}
                              </Text>
                              <XStack width={100} alignItems="center">
                                <PositionDisplay
                                  positions={season.fielding?.position ?? ''}
                                />
                              </XStack>
                              <Text width={50} fontSize="$3">
                                {season.fielding?.games}
                              </Text>
                              <Text width={60} fontSize="$3">
                                {season.fielding?.inn.toFixed(0)}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.fielding?.po}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.fielding?.a}
                              </Text>
                              <Text width={50} fontSize="$3">
                                {season.fielding?.e}
                              </Text>
                            </XStack>
                          ))}
                      </YStack>
                    </YStack>
                  )}
                </>
              )}
            </YStack>
          </ScrollView>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
