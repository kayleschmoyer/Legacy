import React, { useMemo } from 'react';
import {
  Button,
  Dialog,
  H3,
  H4,
  ScrollView,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { LOGGER } from '@legacy-sports/logging';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  getPositionColor,
  SURFACE_CARD,
  TEXT_MUTED,
  WHITE,
  withAlpha,
} from '../constants/colors';
import { useGetAllPlayerSeasonStatsQuery } from '../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerDetailModalProps {
  /** Numeric player ID to load stats for */
  playerId: number | null;
  /** Display name shown in the header */
  playerName: string;
  /** Primary position badge (e.g. "SS", "P") */
  position?: string;
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when the modal should close */
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
    sb: number;
    avg: string;
    obp: string;
    slg: string;
  };
  pitching?: {
    games: number;
    wins: number;
    losses: number;
    era: string;
    ip: number;
    so: number;
    bb: number;
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

// ---------------------------------------------------------------------------
// Stat row helper
// ---------------------------------------------------------------------------

function StatRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <XStack
      justifyContent="space-between"
      paddingVertical="$2"
      paddingHorizontal="$3"
      borderBottomWidth={1}
      borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
    >
      <Text fontSize="$3" color={TEXT_MUTED}>
        {label}
      </Text>
      <Text
        fontSize="$3"
        fontWeight="700"
        color={accent ? BRAND_GOLD_LIGHT : WHITE}
      >
        {value}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Stat table (season rows)
// ---------------------------------------------------------------------------

function SeasonTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <YStack marginBottom="$4">
      <H4 color={BRAND_GOLD} marginBottom="$2" fontSize="$5">
        {title}
      </H4>

      <YStack
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
        borderRadius="$3"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
        overflow="hidden"
      >
        {/* Header row */}
        <XStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
          paddingVertical="$2"
          paddingHorizontal="$3"
          borderBottomWidth={1}
          borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
        >
          {headers.map((h) => (
            <Text
              key={h}
              flex={h === 'YEAR' ? 1.2 : 1}
              fontSize="$2"
              fontWeight="bold"
              color={BRAND_GOLD_LIGHT}
              textAlign={h === 'YEAR' ? 'left' : 'right'}
            >
              {h}
            </Text>
          ))}
        </XStack>

        {/* Data rows */}
        {rows.map((cells, idx) => (
          <XStack
            key={String(cells[0])}
            paddingVertical="$2"
            paddingHorizontal="$3"
            backgroundColor={
              idx % 2 === 0 ? 'transparent' : withAlpha(BRAND_NAVY_LIGHT, 0.06)
            }
            borderBottomWidth={idx < rows.length - 1 ? 1 : 0}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
          >
            {cells.map((cell, ci) => (
              <Text
                key={`${cells[0]}-${headers[ci]}`}
                flex={ci === 0 ? 1.2 : 1}
                fontSize="$2"
                fontWeight={ci === 0 ? '600' : '400'}
                color={ci === 0 ? BRAND_GOLD_LIGHT : WHITE}
                textAlign={ci === 0 ? 'left' : 'right'}
              >
                {cell}
              </Text>
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

/**
 * PlayerDetailModal — Full-featured player detail dialog.
 *
 * Shows season-by-season batting, pitching, and fielding statistics
 * fetched via the `GetAllPlayerSeasonStats` GraphQL query.
 * Styled with the Legacy Sports brand palette.
 */
export function PlayerDetailModal({
  playerId,
  playerName,
  position,
  open,
  onOpenChange,
}: PlayerDetailModalProps) {
  LOGGER.debug('[PlayerDetailModal] render', { playerId, playerName, open });

  // ------ Data fetching ------
  const { data, loading, error } = useGetAllPlayerSeasonStatsQuery({
    variables: { playerId: playerId ?? 0 },
    skip: !playerId || !open,
  });

  // ------ Transform to season rows ------
  const seasonRows = useMemo((): SeasonRow[] => {
    if (!data) return [];

    const seasons = new Map<number, SeasonRow>();

    // Batting
    data.playerSeasonBatting?.forEach(
      (b: {
        season?: number | null;
        games?: number | null;
        plateAppearances?: number | null;
        atBats?: number | null;
        hits?: number | null;
        homeRuns?: number | null;
        rbi?: number | null;
        stolenBases?: number | null;
        baseOnBalls?: number | null;
      }) => {
        if (!b?.season) return;
        const row: SeasonRow = seasons.get(b.season) || { season: b.season };
        const ab = b.atBats ?? 0;
        const h = b.hits ?? 0;
        const pa = b.plateAppearances ?? 0;
        const bb = b.baseOnBalls ?? 0;
        const avg = ab > 0 ? (h / ab).toFixed(3) : '.000';
        const obp = pa > 0 ? ((h + bb) / pa).toFixed(3) : '.000';
        const slg =
          ab > 0 ? (((b.homeRuns ?? 0) * 4 + h) / ab).toFixed(3) : '.000';

        row.batting = {
          games: b.games ?? 0,
          pa,
          ab,
          h,
          hr: b.homeRuns ?? 0,
          rbi: b.rbi ?? 0,
          sb: b.stolenBases ?? 0,
          avg,
          obp,
          slg,
        };
        seasons.set(b.season, row);
      },
    );

    // Pitching
    data.playerSeasonPitching?.forEach(
      (p: {
        season?: number | null;
        games?: number | null;
        wins?: number | null;
        losses?: number | null;
        inningsPitched?: number | null;
        earnedRuns?: number | null;
        strikeouts?: number | null;
        baseOnBalls?: number | null;
      }) => {
        if (!p?.season) return;
        const row: SeasonRow = seasons.get(p.season) || { season: p.season };
        const ip = p.inningsPitched ?? 0;
        const er = p.earnedRuns ?? 0;
        const era = ip > 0 ? ((er * 9) / ip).toFixed(2) : '0.00';

        row.pitching = {
          games: p.games ?? 0,
          wins: p.wins ?? 0,
          losses: p.losses ?? 0,
          era,
          ip,
          so: p.strikeouts ?? 0,
          bb: p.baseOnBalls ?? 0,
        };
        seasons.set(p.season, row);
      },
    );

    // Fielding (aggregate positions per season)
    data.playerSeasonFielding?.forEach(
      (f: {
        season?: number | null;
        games?: number | null;
        inningsDefended?: number | null;
        putouts?: number | null;
        assists?: number | null;
        errors?: number | null;
        position?: string | null;
      }) => {
        if (!f?.season) return;
        const row: SeasonRow = seasons.get(f.season) || { season: f.season };

        if (row.fielding) {
          row.fielding.games += f.games ?? 0;
          row.fielding.inn += f.inningsDefended ?? 0;
          row.fielding.po += f.putouts ?? 0;
          row.fielding.a += f.assists ?? 0;
          row.fielding.e += f.errors ?? 0;
          const pos = f.position ?? '';
          if (pos && !row.fielding.position.includes(pos)) {
            row.fielding.position += (row.fielding.position ? ', ' : '') + pos;
          }
        } else {
          row.fielding = {
            games: f.games ?? 0,
            inn: f.inningsDefended ?? 0,
            po: f.putouts ?? 0,
            a: f.assists ?? 0,
            e: f.errors ?? 0,
            position: f.position ?? '',
          };
        }
        seasons.set(f.season, row);
      },
    );

    return Array.from(seasons.values()).sort((a, b) => b.season - a.season);
  }, [data]);

  // ------ Career totals (sum across all seasons) ------
  const careerTotals = useMemo(() => {
    if (seasonRows.length === 0) return null;
    const batting = seasonRows.filter((r) => r.batting);
    const pitching = seasonRows.filter((r) => r.pitching);

    const totGames = batting.reduce((s, r) => s + (r.batting?.games ?? 0), 0);
    const totAB = batting.reduce((s, r) => s + (r.batting?.ab ?? 0), 0);
    const totH = batting.reduce((s, r) => s + (r.batting?.h ?? 0), 0);
    const totHR = batting.reduce((s, r) => s + (r.batting?.hr ?? 0), 0);
    const totRBI = batting.reduce((s, r) => s + (r.batting?.rbi ?? 0), 0);
    const totSB = batting.reduce((s, r) => s + (r.batting?.sb ?? 0), 0);

    const pGames = pitching.reduce((s, r) => s + (r.pitching?.games ?? 0), 0);
    const pWins = pitching.reduce((s, r) => s + (r.pitching?.wins ?? 0), 0);
    const pLosses = pitching.reduce((s, r) => s + (r.pitching?.losses ?? 0), 0);
    const pIP = pitching.reduce((s, r) => s + (r.pitching?.ip ?? 0), 0);
    const pSO = pitching.reduce((s, r) => s + (r.pitching?.so ?? 0), 0);

    return {
      hasBatting: batting.length > 0,
      hasPitching: pitching.length > 0,
      seasons: seasonRows.length,
      // batting
      games: totGames,
      ab: totAB,
      h: totH,
      hr: totHR,
      rbi: totRBI,
      sb: totSB,
      avg: totAB > 0 ? (totH / totAB).toFixed(3) : '.000',
      // pitching
      pGames,
      pWins,
      pLosses,
      pIP,
      pSO,
    };
  }, [seasonRows]);

  // ------ Batting rows for table ------
  const battingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.batting)
        .map((r) => [
          r.season,
          r.batting!.games,
          r.batting!.pa,
          r.batting!.ab,
          r.batting!.h,
          r.batting!.hr,
          r.batting!.rbi,
          r.batting!.sb,
          r.batting!.avg,
        ]),
    [seasonRows],
  );

  // ------ Pitching rows for table ------
  const pitchingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.pitching)
        .map((r) => [
          r.season,
          r.pitching!.games,
          `${r.pitching!.wins}-${r.pitching!.losses}`,
          r.pitching!.era,
          r.pitching!.ip,
          r.pitching!.so,
          r.pitching!.bb,
        ]),
    [seasonRows],
  );

  // ------ Fielding rows for table ------
  const fieldingTableRows = useMemo(
    () =>
      seasonRows
        .filter((r) => r.fielding)
        .map((r) => [
          r.season,
          r.fielding!.position,
          r.fielding!.games,
          r.fielding!.inn,
          r.fielding!.po,
          r.fielding!.a,
          r.fielding!.e,
        ]),
    [seasonRows],
  );

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
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-detail-title"
          animateOnly={['transform', 'opacity']}
          animation={['quick', { opacity: { overshootClamping: true } }]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          width="92%"
          maxWidth={960}
          maxHeight="88vh"
          backgroundColor={SURFACE_CARD}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
          borderRadius="$5"
          overflow="hidden"
          padding={0}
        >
          {/* ── Glass header ── */}
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            justifyContent="space-between"
            alignItems="center"
            style={{
              background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_DARK} 100%)`,
            }}
          >
            <YStack gap="$1">
              <XStack gap="$2" alignItems="center">
                <H3
                  id="player-detail-title"
                  color={WHITE}
                  fontSize="$7"
                  fontWeight="bold"
                  margin={0}
                >
                  {playerName}
                </H3>
                {position && (
                  <Text
                    fontSize="$2"
                    fontWeight="700"
                    color={WHITE}
                    backgroundColor={getPositionColor(position)}
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                    borderRadius="$2"
                  >
                    {position}
                  </Text>
                )}
              </XStack>
              {careerTotals && (
                <Text fontSize="$2" color={withAlpha(WHITE, 0.75)}>
                  {careerTotals.seasons} season
                  {careerTotals.seasons !== 1 ? 's' : ''}
                </Text>
              )}
            </YStack>

            <Dialog.Close asChild>
              <Button
                size="$3"
                circular
                icon={X}
                aria-label="Close"
                backgroundColor={withAlpha(WHITE, 0.15)}
                color={WHITE}
                hoverStyle={{ backgroundColor: withAlpha(WHITE, 0.25) }}
                pressStyle={{ backgroundColor: withAlpha(WHITE, 0.3) }}
              />
            </Dialog.Close>
          </XStack>

          {/* ── Body ── */}
          <ScrollView maxHeight="calc(88vh - 100px)">
            <YStack padding="$4" gap="$4">
              {/* Loading */}
              {loading && (
                <YStack alignItems="center" paddingVertical="$8">
                  <Spinner size="large" color={BRAND_NAVY_LIGHT} />
                  <Text marginTop="$3" color={TEXT_MUTED}>
                    Loading player statistics…
                  </Text>
                </YStack>
              )}

              {/* Error */}
              {error && (
                <YStack
                  backgroundColor={withAlpha(BRAND_SEAM_RED, 0.12)}
                  padding="$4"
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={withAlpha(BRAND_SEAM_RED, 0.35)}
                >
                  <Text color={BRAND_SEAM_RED} fontWeight="600">
                    Error loading stats
                  </Text>
                  <Text
                    color={withAlpha(BRAND_SEAM_RED, 0.8)}
                    fontSize="$2"
                    marginTop="$1"
                  >
                    {error.message}
                  </Text>
                </YStack>
              )}

              {/* Empty state */}
              {!loading && !error && seasonRows.length === 0 && (
                <YStack
                  alignItems="center"
                  paddingVertical="$8"
                  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
                  borderRadius="$3"
                >
                  <Text color={TEXT_MUTED} fontSize="$4">
                    No season statistics found
                  </Text>
                </YStack>
              )}

              {/* ── Career summary cards ── */}
              {!loading && !error && careerTotals && (
                <>
                  {careerTotals.hasBatting && (
                    <YStack
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                      borderRadius="$4"
                      borderWidth={1}
                      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                      overflow="hidden"
                    >
                      <XStack
                        paddingHorizontal="$4"
                        paddingVertical="$2"
                        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                      >
                        <Text
                          fontSize="$3"
                          fontWeight="700"
                          color={BRAND_GOLD_LIGHT}
                        >
                          Career Batting
                        </Text>
                      </XStack>
                      <StatRow label="Games" value={careerTotals.games} />
                      <StatRow
                        label="Batting Average"
                        value={careerTotals.avg}
                        accent
                      />
                      <StatRow label="Home Runs" value={careerTotals.hr} />
                      <StatRow label="RBI" value={careerTotals.rbi} />
                      <StatRow label="Hits" value={careerTotals.h} />
                      <StatRow label="Stolen Bases" value={careerTotals.sb} />
                    </YStack>
                  )}

                  {careerTotals.hasPitching && (
                    <YStack
                      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                      borderRadius="$4"
                      borderWidth={1}
                      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
                      overflow="hidden"
                    >
                      <XStack
                        paddingHorizontal="$4"
                        paddingVertical="$2"
                        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
                      >
                        <Text
                          fontSize="$3"
                          fontWeight="700"
                          color={BRAND_GOLD_LIGHT}
                        >
                          Career Pitching
                        </Text>
                      </XStack>
                      <StatRow label="Games" value={careerTotals.pGames} />
                      <StatRow
                        label="Record"
                        value={`${careerTotals.pWins}–${careerTotals.pLosses}`}
                        accent
                      />
                      <StatRow
                        label="Innings Pitched"
                        value={careerTotals.pIP}
                      />
                      <StatRow label="Strikeouts" value={careerTotals.pSO} />
                    </YStack>
                  )}

                  <Separator borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)} />
                </>
              )}

              {/* ── Season-by-season tables ── */}
              {!loading && !error && seasonRows.length > 0 && (
                <>
                  {battingTableRows.length > 0 && (
                    <SeasonTable
                      title="Batting by Season"
                      headers={[
                        'YEAR',
                        'G',
                        'PA',
                        'AB',
                        'H',
                        'HR',
                        'RBI',
                        'SB',
                        'AVG',
                      ]}
                      rows={battingTableRows}
                    />
                  )}

                  {pitchingTableRows.length > 0 && (
                    <SeasonTable
                      title="Pitching by Season"
                      headers={['YEAR', 'G', 'W-L', 'ERA', 'IP', 'SO', 'BB']}
                      rows={pitchingTableRows}
                    />
                  )}

                  {fieldingTableRows.length > 0 && (
                    <SeasonTable
                      title="Fielding by Season"
                      headers={['YEAR', 'POS', 'G', 'INN', 'PO', 'A', 'E']}
                      rows={fieldingTableRows}
                    />
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
