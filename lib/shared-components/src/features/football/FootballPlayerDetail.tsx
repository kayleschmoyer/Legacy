import React, { useState } from 'react';
import { Button, H1, Spinner, Text, XStack, YStack } from 'tamagui';
import { ArrowLeft, Lock } from '@tamagui/lucide-icons';
import { NFL_TEAMS } from '../../constants/nflTeams';
import { GameLogsTable } from '../stats/GameLogsTable';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../../utils/typography';
import { Select } from '../../components/Select';

/**
 * Portable career-stats shape consumed by {@link FootballPlayerDetail}.
 *
 * Mirrors the subset of the `FootballPlayer.careerStats` GraphQL type the
 * detail view reads. Both web and mobile pass their generated query results
 * directly — the generated node is structurally assignable to this interface.
 * Note this superset of {@link FootballPlayerCardStats} additionally reads
 * `idp.astTkl`, which the list card omits.
 */
export interface FootballPlayerDetailStats {
  passing?: {
    yds?: number | null;
    td?: number | null;
    int?: number | null;
    rating?: number | null;
  } | null;
  rushing?: {
    yds?: number | null;
    td?: number | null;
  } | null;
  receiving?: {
    rec?: number | null;
    yds?: number | null;
    td?: number | null;
  } | null;
  kicking?: {
    fgm?: number | null;
    fga?: number | null;
  } | null;
  defense?: {
    g?: number | null;
    sacks?: number | null;
    int?: number | null;
    fumRec?: number | null;
    defTd?: number | null;
    ptsAllowedPerG?: number | null;
    ydsAllowedPerG?: number | null;
  } | null;
  idp?: {
    soloTkl?: number | null;
    astTkl?: number | null;
    sacks?: number | null;
    int?: number | null;
    ff?: number | null;
  } | null;
}

export interface FootballSeasonPassingRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  cmp?: number | null;
  att?: number | null;
  yds?: number | null;
  td?: number | null;
  int?: number | null;
  rating?: number | null;
}

export interface FootballSeasonRushingRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  att?: number | null;
  yds?: number | null;
  td?: number | null;
  ydsPerAtt?: number | null;
}

export interface FootballSeasonReceivingRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  tgt?: number | null;
  rec?: number | null;
  yds?: number | null;
  td?: number | null;
  ydsPerRec?: number | null;
}

export interface FootballSeasonDefenseRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  sacks?: number | null;
  int?: number | null;
  fumRec?: number | null;
  defTd?: number | null;
  ptsAllowed?: number | null;
}

export interface FootballSeasonKickingRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  fgm?: number | null;
  fga?: number | null;
  xpm?: number | null;
  xpa?: number | null;
}

export interface FootballSeasonIdpRow {
  season?: number | null;
  team?: string | null;
  g?: number | null;
  soloTkl?: number | null;
  astTkl?: number | null;
  sacks?: number | null;
  int?: number | null;
  pd?: number | null;
  ff?: number | null;
  fr?: number | null;
  defTd?: number | null;
  safeties?: number | null;
}

export interface FootballPlayerDetailSeasonStats {
  passing?: FootballSeasonPassingRow[] | null;
  rushing?: FootballSeasonRushingRow[] | null;
  receiving?: FootballSeasonReceivingRow[] | null;
  defense?: FootballSeasonDefenseRow[] | null;
  kicking?: FootballSeasonKickingRow[] | null;
  idp?: FootballSeasonIdpRow[] | null;
}

export interface FootballPlayerDetailPlayer {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
  isDst?: boolean | null;
  careerStats?: FootballPlayerDetailStats | null;
  seasonStats?: FootballPlayerDetailSeasonStats | null;
  previousTeams: string[];
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtFloat(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return n.toFixed(decimals);
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <YStack alignItems="center" gap={2} minWidth={50}>
      <Text
        fontSize={16}
        fontWeight="700"
        color={TEXT_PRIMARY}
        fontVariant={['tabular-nums']}
      >
        {value}
      </Text>
      <Text
        fontSize={11}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        textAlign="center"
      >
        {label}
      </Text>
    </YStack>
  );
}

function StatGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <YStack gap={8}>
      <Text
        fontSize={13}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        fontWeight="600"
      >
        {title}
      </Text>
      <XStack
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={OUTLINE_SUBTLE}
        borderRadius={8}
        padding={16}
        gap={20}
        flexWrap="wrap"
      >
        {children}
      </XStack>
    </YStack>
  );
}

function IdpStatsTable({ stats }: { stats: FootballPlayerDetailStats }) {
  const idp = stats.idp;
  return (
    <StatGroup title="Career IDP Stats">
      <StatCell label="Solo" value={fmt(idp?.soloTkl)} />
      <StatCell label="Ast" value={fmt(idp?.astTkl)} />
      <StatCell label="Sacks" value={fmtFloat(idp?.sacks)} />
      <StatCell label="INT" value={fmt(idp?.int)} />
      <StatCell label="FF" value={fmt(idp?.ff)} />
    </StatGroup>
  );
}

/** Per-game rate from a career total and games played; null when games is unknown/zero. */
function perGame(
  total: number | null | undefined,
  games: number | null | undefined,
): number | null {
  if (total == null || games == null || games <= 0) return null;
  return total / games;
}

function DstStatsTable({ stats }: { stats: FootballPlayerDetailStats }) {
  const d = stats.defense;
  const g = d?.g;
  return (
    <StatGroup title="Career DST Stats">
      <StatCell label="Sacks" value={fmtFloat(d?.sacks)} />
      <StatCell label="Sacks/G" value={fmtFloat(perGame(d?.sacks, g))} />
      <StatCell label="INT" value={fmt(d?.int)} />
      <StatCell label="INT/G" value={fmtFloat(perGame(d?.int, g), 2)} />
      <StatCell label="Def TD" value={fmt(d?.defTd)} />
      <StatCell label="Fum Rec" value={fmt(d?.fumRec)} />
      <StatCell label="Pts Allowed/G" value={fmtFloat(d?.ptsAllowedPerG)} />
      <StatCell label="Yds Allowed/G" value={fmtFloat(d?.ydsAllowedPerG)} />
    </StatGroup>
  );
}

// ── Season breakdown table helpers ───────────────────────────────────────────

const TABLE_HEADER_STYLE: React.CSSProperties = {
  textAlign: 'left' as const,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  color: TEXT_MUTED,
  borderBottom: `1px solid ${OUTLINE_SUBTLE}`,
  whiteSpace: 'nowrap' as const,
};

const TABLE_CELL_STYLE: React.CSSProperties = {
  textAlign: 'right' as const,
  padding: '6px 8px',
  fontSize: 13,
  color: TEXT_PRIMARY,
  fontVariantNumeric: 'tabular-nums',
  borderBottom: `1px solid ${withAlpha(OUTLINE_SUBTLE, 0.5)}`,
};

const TABLE_CELL_LEFT_STYLE: React.CSSProperties = {
  ...TABLE_CELL_STYLE,
  textAlign: 'left' as const,
};

const TABLE_WRAP_STYLE: React.CSSProperties = {
  overflowX: 'auto' as const,
  WebkitOverflowScrolling: 'touch' as const,
};

function SeasonTableWrap({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <YStack gap={8}>
      <Text
        fontSize={13}
        color={TEXT_MUTED}
        fontFamily={FONT_BODY}
        fontWeight="600"
      >
        {title}
      </Text>
      <YStack
        backgroundColor={SURFACE_CARD}
        borderWidth={1}
        borderColor={OUTLINE_SUBTLE}
        borderRadius={8}
        style={TABLE_WRAP_STYLE}
      >
        {children}
      </YStack>
    </YStack>
  );
}

function PassingSeasonTable({ rows }: { rows: FootballSeasonPassingRow[] }) {
  return (
    <SeasonTableWrap title="Passing — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}
      >
        <thead>
          <tr>
            {['YEAR', 'TEAM', 'G', 'CMP', 'ATT', 'YDS', 'TD', 'INT', 'RTG'].map(
              (h) => (
                <th
                  key={h}
                  style={
                    h === 'YEAR' || h === 'TEAM'
                      ? TABLE_HEADER_STYLE
                      : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                  }
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.cmp)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.att)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.yds)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.td)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.int)}</td>
              <td style={TABLE_CELL_STYLE}>{fmtFloat(r.rating)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

function RushingSeasonTable({ rows }: { rows: FootballSeasonRushingRow[] }) {
  return (
    <SeasonTableWrap title="Rushing — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}
      >
        <thead>
          <tr>
            {['YEAR', 'TEAM', 'G', 'ATT', 'YDS', 'TD', 'YDS/ATT'].map((h) => (
              <th
                key={h}
                style={
                  h === 'YEAR' || h === 'TEAM'
                    ? TABLE_HEADER_STYLE
                    : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.att)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.yds)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.td)}</td>
              <td style={TABLE_CELL_STYLE}>{fmtFloat(r.ydsPerAtt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

function ReceivingSeasonTable({
  rows,
}: {
  rows: FootballSeasonReceivingRow[];
}) {
  return (
    <SeasonTableWrap title="Receiving — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}
      >
        <thead>
          <tr>
            {['YEAR', 'TEAM', 'G', 'TGT', 'REC', 'YDS', 'TD', 'YDS/REC'].map(
              (h) => (
                <th
                  key={h}
                  style={
                    h === 'YEAR' || h === 'TEAM'
                      ? TABLE_HEADER_STYLE
                      : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                  }
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.tgt)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.rec)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.yds)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.td)}</td>
              <td style={TABLE_CELL_STYLE}>{fmtFloat(r.ydsPerRec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

function DefenseSeasonTable({ rows }: { rows: FootballSeasonDefenseRow[] }) {
  return (
    <SeasonTableWrap title="Defense — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}
      >
        <thead>
          <tr>
            {['YEAR', 'TEAM', 'G', 'SACKS', 'INT', 'FUM', 'DEF TD', 'PTS'].map(
              (h) => (
                <th
                  key={h}
                  style={
                    h === 'YEAR' || h === 'TEAM'
                      ? TABLE_HEADER_STYLE
                      : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                  }
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmtFloat(r.sacks)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.int)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.fumRec)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.defTd)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.ptsAllowed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

function KickingSeasonTable({ rows }: { rows: FootballSeasonKickingRow[] }) {
  return (
    <SeasonTableWrap title="Kicking — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}
      >
        <thead>
          <tr>
            {['YEAR', 'TEAM', 'G', 'FGM', 'FGA', 'XPM', 'XPA'].map((h) => (
              <th
                key={h}
                style={
                  h === 'YEAR' || h === 'TEAM'
                    ? TABLE_HEADER_STYLE
                    : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.fgm)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.fga)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.xpm)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.xpa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

function IdpSeasonTable({ rows }: { rows: FootballSeasonIdpRow[] }) {
  return (
    <SeasonTableWrap title="IDP — Season Breakdown">
      <table
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}
      >
        <thead>
          <tr>
            {[
              'YEAR',
              'TEAM',
              'G',
              'SOLO',
              'AST',
              'SACKS',
              'INT',
              'PD',
              'FF',
            ].map((h) => (
              <th
                key={h}
                style={
                  h === 'YEAR' || h === 'TEAM'
                    ? TABLE_HEADER_STYLE
                    : { ...TABLE_HEADER_STYLE, textAlign: 'right' }
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.season}-${r.team}-${i}`}>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.season ?? '—'}</td>
              <td style={TABLE_CELL_LEFT_STYLE}>{r.team ?? '—'}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.g)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.soloTkl)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.astTkl)}</td>
              <td style={TABLE_CELL_STYLE}>{fmtFloat(r.sacks)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.int)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.pd)}</td>
              <td style={TABLE_CELL_STYLE}>{fmt(r.ff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SeasonTableWrap>
  );
}

const ALL_SEASONS = 'all';

function extractSeasons(ss: FootballPlayerDetailSeasonStats): number[] {
  const seen = new Set<number>();
  for (const arr of [
    ss.passing,
    ss.rushing,
    ss.receiving,
    ss.defense,
    ss.kicking,
    ss.idp,
  ]) {
    for (const row of arr ?? []) {
      if (row.season != null) seen.add(row.season);
    }
  }
  return Array.from(seen).sort((a, b) => b - a);
}

function SeasonBreakdowns({ player }: { player: FootballPlayerDetailPlayer }) {
  const ss = player.seasonStats;

  const allSeasons = ss ? extractSeasons(ss) : [];

  const [selectedSeason, setSelectedSeason] = useState<string>(ALL_SEASONS);

  if (!ss) return null;

  const passing = ss.passing ?? [];
  const rushing = ss.rushing ?? [];
  const receiving = ss.receiving ?? [];
  const defense = ss.defense ?? [];
  const kicking = ss.kicking ?? [];
  const idp = ss.idp ?? [];

  if (
    passing.length === 0 &&
    rushing.length === 0 &&
    receiving.length === 0 &&
    defense.length === 0 &&
    kicking.length === 0 &&
    idp.length === 0
  ) {
    return null;
  }

  const filterRows = <T extends { season?: number | null }>(rows: T[]): T[] =>
    selectedSeason === ALL_SEASONS
      ? rows
      : rows.filter((r) => String(r.season) === selectedSeason);

  const filteredPassing = filterRows(passing);
  const filteredRushing = filterRows(rushing);
  const filteredReceiving = filterRows(receiving);
  const filteredDefense = filterRows(defense);
  const filteredKicking = filterRows(kicking);
  const filteredIdp = filterRows(idp);

  const seasonOptions = [
    { value: ALL_SEASONS, label: 'All Seasons' },
    ...allSeasons.map((s) => ({ value: String(s), label: String(s) })),
  ];

  return (
    <YStack gap={16}>
      {allSeasons.length > 0 && (
        <Select
          label="Season"
          value={selectedSeason}
          onValueChange={setSelectedSeason}
          options={seasonOptions}
        />
      )}
      <YStack gap={20}>
        {filteredPassing.length > 0 && (
          <PassingSeasonTable rows={filteredPassing} />
        )}
        {filteredRushing.length > 0 && (
          <RushingSeasonTable rows={filteredRushing} />
        )}
        {filteredReceiving.length > 0 && (
          <ReceivingSeasonTable rows={filteredReceiving} />
        )}
        {filteredDefense.length > 0 && (
          <DefenseSeasonTable rows={filteredDefense} />
        )}
        {filteredKicking.length > 0 && (
          <KickingSeasonTable rows={filteredKicking} />
        )}
        {filteredIdp.length > 0 && <IdpSeasonTable rows={filteredIdp} />}
      </YStack>
    </YStack>
  );
}

// ── Career stat tables ────────────────────────────────────────────────────────

/** True when `obj` exists and at least one of its fields is non-null. */
function hasAnyValue(obj: object | null | undefined): boolean {
  return obj != null && Object.values(obj).some((v) => v != null);
}

function PassingStatGroup({ stats }: { stats: FootballPlayerDetailStats }) {
  const p = stats.passing;
  return (
    <StatGroup title="Career Passing">
      <StatCell label="YDS" value={fmt(p?.yds)} />
      <StatCell label="TD" value={fmt(p?.td)} />
      <StatCell label="INT" value={fmt(p?.int)} />
      <StatCell label="RTG" value={fmtFloat(p?.rating)} />
    </StatGroup>
  );
}

function RushingStatGroup({ stats }: { stats: FootballPlayerDetailStats }) {
  const r = stats.rushing;
  return (
    <StatGroup title="Career Rushing">
      <StatCell label="YDS" value={fmt(r?.yds)} />
      <StatCell label="TD" value={fmt(r?.td)} />
    </StatGroup>
  );
}

function ReceivingStatGroup({ stats }: { stats: FootballPlayerDetailStats }) {
  const r = stats.receiving;
  return (
    <StatGroup title="Career Receiving">
      <StatCell label="REC" value={fmt(r?.rec)} />
      <StatCell label="YDS" value={fmt(r?.yds)} />
      <StatCell label="TD" value={fmt(r?.td)} />
    </StatGroup>
  );
}

function KickingStatGroup({ stats }: { stats: FootballPlayerDetailStats }) {
  const k = stats.kicking;
  const fgPct = k?.fga && k.fga > 0 ? ((k.fgm ?? 0) / k.fga) * 100 : null;
  return (
    <StatGroup title="Career Kicking">
      <StatCell label="FGM" value={fmt(k?.fgm)} />
      <StatCell label="FGA" value={fmt(k?.fga)} />
      <StatCell label="FG%" value={fmtFloat(fgPct)} />
    </StatGroup>
  );
}

function OffenseStatsTable({
  pos,
  stats,
}: {
  pos: string | null | undefined;
  stats: FootballPlayerDetailStats;
}) {
  if (pos === 'QB') return <PassingStatGroup stats={stats} />;
  if (pos === 'RB') return <RushingStatGroup stats={stats} />;
  if (pos === 'WR' || pos === 'TE') return <ReceivingStatGroup stats={stats} />;
  if (pos === 'K') return <KickingStatGroup stats={stats} />;

  // Unknown or missing position (e.g. FB, OL, or null). Rather than render
  // nothing — leaving a silently empty page below the header — fall back to
  // showing whatever career categories actually have data, and an explanatory
  // message when none do (LS-6243 / FPD-019).
  const groups: React.ReactNode[] = [];
  if (hasAnyValue(stats.passing))
    groups.push(<PassingStatGroup key="passing" stats={stats} />);
  if (hasAnyValue(stats.rushing))
    groups.push(<RushingStatGroup key="rushing" stats={stats} />);
  if (hasAnyValue(stats.receiving))
    groups.push(<ReceivingStatGroup key="receiving" stats={stats} />);
  if (hasAnyValue(stats.kicking))
    groups.push(<KickingStatGroup key="kicking" stats={stats} />);

  if (groups.length > 0) {
    return <YStack gap={20}>{groups}</YStack>;
  }

  return (
    <YStack
      backgroundColor={SURFACE_CARD}
      borderWidth={1}
      borderColor={OUTLINE_SUBTLE}
      borderRadius={8}
      padding={20}
      alignItems="center"
    >
      <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
        No supported stats for this position
      </Text>
    </YStack>
  );
}

// ── Projections premium upsell ────────────────────────────────────────────────

/**
 * Placeholder teaser rows shown behind the blur. The values are intentionally
 * fabricated — this is a marketing upsell, not real projection data — so a free
 * user gets a sense of what Premium unlocks without exposing anything real.
 */
const PROJECTION_TEASER_ROWS: { label: string; value: string }[] = [
  { label: 'Proj. Fantasy Pts', value: '21.4' },
  { label: 'Matchup Rating', value: 'A−' },
  { label: 'Strength of Schedule', value: '6th' },
];

/**
 * "Projections (Premium)" upsell card. Renders a blurred teaser of the locked
 * projections / matchup-rating / strength-of-schedule content with a lock badge
 * and an "Upgrade to Premium" CTA. The blur (`filter`) is a web-only CSS effect
 * and is ignored on React Native, where the reduced opacity alone dims the
 * teaser — mirroring the cross-platform PremiumGate treatment.
 */
function ProjectionsTeaser({ onUpgrade }: { onUpgrade?: () => void }) {
  return (
    <YStack
      position="relative"
      overflow="hidden"
      borderRadius={8}
      borderWidth={1}
      borderColor={withAlpha(BRAND_GOLD, 0.45)}
    >
      {/* Blurred teaser content */}
      <YStack
        gap={8}
        padding={16}
        backgroundColor={SURFACE_CARD}
        pointerEvents="none"
        opacity={0.5}
        style={{ filter: 'blur(5px)', userSelect: 'none' }}
      >
        <Text
          fontSize={13}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          fontWeight="600"
        >
          Projections
        </Text>
        <XStack gap={20} flexWrap="wrap">
          {PROJECTION_TEASER_ROWS.map((r) => (
            <StatCell key={r.label} label={r.label} value={r.value} />
          ))}
        </XStack>
      </YStack>

      {/* Lock overlay + upgrade CTA */}
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems="center"
        justifyContent="center"
        gap={8}
        padding={16}
        style={{
          background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.7)} 0%, ${BRAND_NAVY} 100%)`,
        }}
      >
        <Lock size={24} color={BRAND_GOLD_LIGHT} />
        <Text
          fontSize={15}
          fontWeight="800"
          color={BRAND_GOLD}
          fontFamily={FONT_DISPLAY}
          textAlign="center"
        >
          Projections (Premium)
        </Text>
        <Text
          fontSize={12}
          color={TEXT_MUTED}
          fontFamily={FONT_BODY}
          textAlign="center"
          maxWidth={300}
        >
          Unlock weekly projections, matchup ratings, and strength-of-schedule
          with Premium.
        </Text>
        <Button
          size="$3"
          onPress={onUpgrade}
          color={BRAND_NAVY}
          fontWeight="700"
          pressStyle={{ opacity: 0.85 }}
          hoverStyle={{ opacity: 0.92 }}
          style={{
            background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
          }}
        >
          Upgrade to Premium
        </Button>
      </YStack>
    </YStack>
  );
}

/** Valid tab identifiers for the football player detail URL contract. */
export type FootballPlayerTab = 'overview' | 'advanced' | 'news';

const VALID_TABS: ReadonlySet<string> = new Set<FootballPlayerTab>([
  'overview',
  'advanced',
  'news',
]);

function isFootballPlayerTab(value: string): value is FootballPlayerTab {
  return VALID_TABS.has(value);
}

/** Coerce an arbitrary string to a valid tab, falling back to 'overview'. */
export function resolveFootballPlayerTab(
  raw: string | null | undefined,
): FootballPlayerTab {
  if (raw && isFootballPlayerTab(raw)) return raw;
  return 'overview';
}

export interface FootballPlayerDetailProps {
  player: FootballPlayerDetailPlayer | null | undefined;
  loading?: boolean;
  error?: boolean;
  /**
   * Called when the back affordance is pressed. Apps supply their own
   * navigation (react-router on web, expo-router on mobile); the component
   * stays platform-agnostic. The back row is hidden when omitted.
   */
  onBack?: () => void;
  /**
   * Whether the current user has premium access. When `false` (the default),
   * the "Projections (Premium)" upsell teaser is shown. When `true`, the teaser
   * is hidden — premium projection data is not yet available, so there is
   * nothing to render for premium users.
   */
  isPremium?: boolean;
  /**
   * Called when the Projections upsell CTA is pressed. Apps supply their own
   * upgrade flow (UpgradeModal on web). When omitted, the teaser still renders
   * but the CTA is inert.
   */
  onUpgrade?: () => void;
  /**
   * Active tab driven by the `?tab=` URL param. Defaults to `'overview'`.
   * Premium tabs (`'advanced'`, `'news'`) are reserved for FPD-022 and
   * FPD-027 respectively; passing them before those features land is a no-op.
   */
  initialTab?: FootballPlayerTab;
}

/**
 * Cross-platform NFL player detail view: team-color header swatch, position
 * badge, and position-specific career stat cards (passing / rushing /
 * receiving / kicking / DST / IDP). Data is injected via props so the same
 * component renders on web (react-router) and mobile (expo-router).
 */
export function FootballPlayerDetail({
  player,
  loading,
  error,
  onBack,
  isPremium = false,
  onUpgrade,
  initialTab: _initialTab = 'overview',
}: FootballPlayerDetailProps) {
  const teamData = player?.nflTeam ? NFL_TEAMS[player.nflTeam] : null;
  const isDst = player?.isDst ?? false;
  const previousTeams = player?.previousTeams ?? [];
  const isIdp =
    player?.position === 'DL' ||
    player?.position === 'LB' ||
    player?.position === 'DB';
  // Accessible name for the team-color swatch so screen readers announce the
  // full franchise ("Kansas City Chiefs") rather than the bare abbreviation
  // ("KC") rendered inside it (LS-6240).
  const teamBadgeLabel = player?.nflTeam
    ? (teamData?.fullName ?? player.nflTeam)
    : 'Free Agent';

  return (
    <YStack flex={1} backgroundColor={BG_DARK}>
      {/* Back nav */}
      {onBack && (
        <XStack
          paddingHorizontal={16}
          paddingVertical={12}
          alignItems="center"
          gap={8}
          onPress={onBack}
          cursor="pointer"
          pressStyle={{ opacity: 0.7 }}
          hoverStyle={{ opacity: 0.7 }}
        >
          <ArrowLeft size={16} color={TEXT_MUTED} />
          <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
            Back to Players
          </Text>
        </XStack>
      )}

      {loading && (
        <YStack
          flex={1}
          alignItems="center"
          justifyContent="center"
          padding={40}
        >
          <Spinner size="large" color={BRAND_GOLD} />
        </YStack>
      )}

      {error && (
        <YStack padding={24}>
          <Text
            color={BRAND_SEAM_RED_LIGHT}
            fontSize={14}
            fontFamily={FONT_BODY}
          >
            Failed to load player. Please try again.
          </Text>
        </YStack>
      )}

      {player && (
        <YStack padding={24} gap={20} maxWidth={640} width="100%">
          {/* Player header */}
          <XStack gap={12} alignItems="center">
            {/* Team color swatch */}
            <YStack
              width={56}
              height={56}
              borderRadius={10}
              accessibilityRole="image"
              aria-label={teamBadgeLabel}
              accessibilityLabel={teamBadgeLabel}
              backgroundColor={
                player.nflTeam
                  ? (teamData?.primaryColor ?? BRAND_NAVY)
                  : withAlpha(TEXT_MUTED, 0.2)
              }
              borderWidth={2}
              borderColor={
                player.nflTeam
                  ? (teamData?.secondaryColor ?? BRAND_GOLD)
                  : TEXT_MUTED
              }
              alignItems="center"
              justifyContent="center"
            >
              <Text
                fontSize={13}
                fontWeight="800"
                color={
                  player.nflTeam
                    ? (teamData?.secondaryColor ?? BRAND_GOLD)
                    : TEXT_MUTED
                }
                fontFamily={FONT_DISPLAY}
                textAlign="center"
              >
                {player.nflTeam ?? 'FA'}
              </Text>
            </YStack>

            <YStack flex={1} gap={4}>
              <H1
                fontSize={22}
                fontWeight="800"
                color={TEXT_PRIMARY}
                fontFamily={FONT_DISPLAY}
                letterSpacing={-0.3}
                margin={0}
              >
                {[player.firstName, player.lastName].filter(Boolean).join(' ')}
              </H1>
              <XStack gap={8} alignItems="center">
                <YStack
                  paddingHorizontal={8}
                  paddingVertical={3}
                  borderRadius={5}
                  backgroundColor={withAlpha(BRAND_NAVY, 0.4)}
                  borderWidth={1}
                  borderColor={BRAND_NAVY}
                >
                  <Text fontSize={12} fontWeight="700" color={TEXT_PRIMARY}>
                    {isDst ? 'DST' : (player.position ?? '?')}
                  </Text>
                </YStack>
                {player.nflTeam ? (
                  <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                    {teamData
                      ? `${teamData.city} · ${player.nflTeam}`
                      : player.nflTeam}
                  </Text>
                ) : (
                  <Text fontSize={13} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                    Free Agent
                  </Text>
                )}
                {previousTeams.length > 0 && (
                  <Text fontSize={12} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                    {`previously: ${previousTeams.join(', ')}`}
                  </Text>
                )}
              </XStack>
            </YStack>
          </XStack>

          {/* Career stats summary */}
          {!player.careerStats ? (
            <YStack
              backgroundColor={SURFACE_CARD}
              borderWidth={1}
              borderColor={OUTLINE_SUBTLE}
              borderRadius={8}
              padding={20}
              alignItems="center"
            >
              <Text fontSize={14} color={TEXT_MUTED} fontFamily={FONT_BODY}>
                No stats available
              </Text>
            </YStack>
          ) : isDst ? (
            <DstStatsTable stats={player.careerStats} />
          ) : isIdp ? (
            <IdpStatsTable stats={player.careerStats} />
          ) : (
            <OffenseStatsTable
              pos={player.position}
              stats={player.careerStats}
            />
          )}

          {/* Season-by-season breakdown tables */}
          <SeasonBreakdowns player={player} />

          {/* Projections premium upsell — shown to free users only */}
          {!isPremium && <ProjectionsTeaser onUpgrade={onUpgrade} />}

          {/* Game Logs */}
          <YStack gap={8}>
            <Text
              fontSize={13}
              color={TEXT_MUTED}
              fontFamily={FONT_BODY}
              fontWeight="600"
            >
              GAME LOGS
            </Text>
            <GameLogsTable sport="nfl" initialPlayerId={String(player.id)} />
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}

export default FootballPlayerDetail;
