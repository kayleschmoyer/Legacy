import React, { useMemo } from 'react';
import { Text, YStack } from 'tamagui';
import {
  type CurrentDraftPickInfo,
  type DraftPickRecord,
  type DraftPlayer,
  type LeagueTeam,
} from './types';
import { getPositionColor, normalizeTeamId } from './utils';
import {
  formatDelta,
  formatNetValue,
  pickValue,
  signatureStat,
  teamInitials,
  teamNetValue,
  type TintBand,
  tintBand,
} from './valueHeat';
import type { SportKind } from '../../config/sports';
import {
  BLUE_LIGHT,
  BRAND_GOLD,
  BRAND_GOLD_PRESS,
  EMERALD_LIGHT,
  OUTLINE_SUBTLE,
  SCORE_LOSS,
  SCORE_WIN,
  SLATE_400,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { FONT_DISPLAY } from '../../utils/typography';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ---------------------------------------------------------------------------
// Draft Grid Sub-component (team columns view) — ported 1:1 from styles.ts's
// .d-draft-grid-* rules (LS-10067, mirroring the LS-9064/LS-9152 approach
// established by DraftRail.tsx/DraftIntelligence.tsx). tamaguiStyled()
// isolates Tamagui's any-typed styled() API from strict lint. Colors are
// theme tokens or withAlpha() derivations rather than literal hex/rgba
// strings so the theme-compliance ratchet (scripts/check-theme-compliance.mjs)
// doesn't flag them; see .agents/skills/ui/SKILL.md (epic LS-8518).
//
// `.on-clock` / `.filled` / `.current` / `.me-team` are no longer CSS
// classNames — each is now a `tamaguiStyled` variant (or a plain conditional
// prop) that reproduces the same rule from styles.ts. The `.me-team`
// className token is still applied literally on the filled/my-team cell
// alongside the Tamagui styling: DraftGrid.spec.tsx asserts against it
// directly (`cell?.className`), and it costs nothing to keep since the old
// `.d-draft-grid-cell.me-team` CSS rule (styles.ts) simply goes unused now
// that the visual result comes from Tamagui props instead.
// ---------------------------------------------------------------------------

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const SURFACE_OVERLAY_FAINT = withAlpha(WHITE, 0.015);
const SURFACE_OVERLAY_SUBTLE = withAlpha(WHITE, 0.04);
const SURFACE_OVERLAY_STRONG = withAlpha(WHITE, 0.07);
const BORDER_HAIRLINE = withAlpha(WHITE, 0.03);
const TEXT_MUTED_DIM = withAlpha(TEXT_PRIMARY, 0.45);
const OFFLINE_DOT = withAlpha(SLATE_400, 0.35);
// `${posColor}17` in the pre-port code was a hex-alpha suffix for ~9% opacity
// (0x17 / 255); withAlpha() reproduces the exact same alpha as a fraction.
const POS_TINT_ALPHA = 0x17 / 255;

const GridView = tamaguiStyled(YStack, {
  tag: 'div',
  overflow: 'scroll',
  paddingBottom: 8,
}) as StyledComponent;

const GridTable = tamaguiStyled(YStack, {
  tag: 'div',
  display: 'grid',
  gap: 2,
  minWidth: '100%',
}) as StyledComponent;

const HeaderCell = tamaguiStyled(YStack, {
  tag: 'div',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 6,
  paddingVertical: 8,
  backgroundColor: SURFACE_OVERLAY_SUBTLE,
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  borderBottomWidth: 2,
  borderBottomColor: OUTLINE_SUBTLE,
  variants: {
    onClock: {
      true: {
        // Gradient in styles.ts isn't a Tamagui style prop — approximated as
        // a flat gold tint (same pattern as CurrentPickPanel's StateBtn).
        backgroundColor: withAlpha(BRAND_GOLD, 0.1),
        borderBottomColor: BRAND_GOLD,
      },
      false: {},
    },
  } as const,
}) as StyledComponent;

const HeaderLabel = tamaguiStyled(Text, {
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 0.5,
  textAlign: 'center',
  color: TEXT_MUTED,
  variants: {
    onClock: {
      true: { color: BRAND_GOLD },
      false: {},
    },
  } as const,
}) as StyledComponent;

const OnlineDot = tamaguiStyled(YStack, {
  width: 7,
  height: 7,
  borderRadius: 9999,
  marginRight: 5,
  flexShrink: 0,
}) as StyledComponent;

const RoundLabelCell = tamaguiStyled(YStack, {
  tag: 'div',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 28,
  paddingHorizontal: 4,
  paddingVertical: 5,
  backgroundColor: SURFACE_OVERLAY_FAINT,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
}) as StyledComponent;

const Cell = tamaguiStyled(YStack, {
  tag: 'div',
  position: 'relative',
  overflow: 'hidden',
  alignItems: 'center',
  justifyContent: 'center',
  // Option C stacks three lines in the cell — pick/rank + delta, the player
  // name, then position/club + signature stat — so the cell is taller than
  // the single-line version it replaces (LS-10096).
  minHeight: 60,
  paddingHorizontal: 6,
  paddingVertical: 6,
  gap: 2,
  backgroundColor: SURFACE_OVERLAY_FAINT,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  hoverStyle: {},
  variants: {
    filled: {
      true: {
        backgroundColor: SURFACE_OVERLAY_SUBTLE,
        hoverStyle: { backgroundColor: SURFACE_OVERLAY_STRONG },
        // A drafted cell lays its three lines out full-width top-to-bottom;
        // an empty or on-the-clock cell keeps the centered single glyph.
        alignItems: 'stretch',
        justifyContent: 'space-between',
      },
      false: {},
    },
    current: {
      true: {
        // Gradient + pulse animation in styles.ts aren't Tamagui style props
        // — approximated as a flat gold tint, same tradeoff as elsewhere in
        // this file.
        backgroundColor: withAlpha(BRAND_GOLD, 0.09),
        borderColor: withAlpha(BRAND_GOLD, 0.3),
      },
      false: {},
    },
    meTeam: {
      true: {
        borderColor: withAlpha(BRAND_GOLD, 0.4),
        borderLeftColor: BRAND_GOLD,
      },
      false: {},
    },
  } as const,
}) as StyledComponent;

const CellName = tamaguiStyled(Text, {
  position: 'relative',
  zIndex: 1,
  fontSize: 10,
}) as StyledComponent;

// ---------------------------------------------------------------------------
// Value heat (LS-10096)
//
// Tint grounds and borders derive from the same SCORE_WIN / SCORE_LOSS tokens
// the signed delta uses, at the alphas the option-C prototype established —
// no new hues, and the ground and the number in it can never disagree about
// which direction a pick went. DraftRail.tsx already tints a ground with
// withAlpha(SCORE_WIN, …); this follows it.
//
// The tint is a *second* channel only. Every drafted cell also carries the
// signed number, so the steal/reach signal survives for a colorblind reader
// and at these deliberately low alphas. Both delta colors clear 4.5:1 against
// their own tinted ground (SCORE_WIN #6FD39A and SCORE_LOSS #E07A8C are the
// semantic *foreground* tokens, chosen over the darker base hues for exactly
// that reason).
// ---------------------------------------------------------------------------

const TINT_GROUND: Record<TintBand, string | undefined> = {
  3: withAlpha(SCORE_WIN, 0.14),
  2: withAlpha(SCORE_WIN, 0.07),
  0: undefined,
  '-2': withAlpha(SCORE_LOSS, 0.07),
  '-3': withAlpha(SCORE_LOSS, 0.14),
};

const TINT_BORDER: Record<TintBand, string | undefined> = {
  3: withAlpha(SCORE_WIN, 0.42),
  2: withAlpha(SCORE_WIN, 0.26),
  0: undefined,
  '-2': withAlpha(SCORE_LOSS, 0.26),
  '-3': withAlpha(SCORE_LOSS, 0.42),
};

/** Color for a signed value: green above zero, red below, muted at zero, and
 *  muted again when the value is unknown (rendered as an em dash). */
const valueColor = (value: number | null): string => {
  if (value == null || value === 0) return TEXT_MUTED;
  return value > 0 ? SCORE_WIN : SCORE_LOSS;
};

const CellTopLine = tamaguiStyled(YStack, {
  tag: 'div',
  flexDirection: 'row',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  width: '100%',
  gap: 4,
}) as StyledComponent;

const CellPickLabel = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 9,
  letterSpacing: 0.4,
  color: TEXT_MUTED,
}) as StyledComponent;

const CellDelta = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontSize: 12,
}) as StyledComponent;

const CellMeta = tamaguiStyled(Text, {
  fontSize: 9,
  color: TEXT_SECONDARY,
  numberOfLines: 1,
}) as StyledComponent;

const CellStat = tamaguiStyled(Text, {
  fontFamily: FONT_DISPLAY,
  fontWeight: '700',
  fontSize: 10,
  color: TEXT_PRIMARY,
}) as StyledComponent;

const CellStatLabel = tamaguiStyled(Text, {
  fontSize: 8,
  letterSpacing: 0.5,
  color: TEXT_MUTED,
  marginLeft: 3,
}) as StyledComponent;

const FooterLabelCell = tamaguiStyled(YStack, {
  tag: 'div',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 4,
  paddingVertical: 6,
}) as StyledComponent;

const FooterCell = tamaguiStyled(YStack, {
  tag: 'div',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 4,
  paddingVertical: 6,
  backgroundColor: SURFACE_CARD,
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  borderRadius: 6,
}) as StyledComponent;

const LegendRow = tamaguiStyled(YStack, {
  tag: 'div',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  marginTop: 10,
  paddingTop: 10,
  borderTopWidth: 1,
  borderTopColor: OUTLINE_SUBTLE,
}) as StyledComponent;

const LegendSwatch = tamaguiStyled(YStack, {
  width: 18,
  height: 10,
  borderRadius: 2,
  borderWidth: 1,
  borderColor: OUTLINE_SUBTLE,
  marginRight: 5,
}) as StyledComponent;

/** Legend entries, in board order. The copy quotes the thresholds tintBand()
 *  actually uses — the option-C prototype's legend said "8+" against code
 *  that branches on 6 and 14, and that wrong copy is not carried across. */
const LEGEND_BANDS: ReadonlyArray<{ band: TintBand; label: string }> = [
  { band: 3, label: 'big steal — fell 14+ slots' },
  { band: 2, label: 'steal — fell 6–13 slots' },
  { band: 0, label: 'on consensus — within 5 slots' },
  { band: -2, label: 'reach — 6–13 slots early' },
  { band: -3, label: 'big reach — 14+ slots early' },
];

// `Text` from 'tamagui' doesn't type a `title` (web tooltip) prop; wrapping
// via tamaguiStyled() relaxes it to Record<string, unknown> like the other
// styled aliases above, so the tooltip can survive the port.
const TitledText = tamaguiStyled(Text, {}) as StyledComponent;

export function DraftGrid({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  maxRounds,
  sport,
  autoPickTeamIds = new Set<string>(),
  onlineTeamIds = new Set<string>(),
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  maxRounds: number;
  /** Active league sport — drives the position-color stripe (LS-8784).
   *  Required, not defaulted: DraftGrid's only consumer is DraftPlayerBoard,
   *  which always has a sport in scope, and a silent default would just
   *  reintroduce the wrong-color-for-football bug this prop exists to fix. */
  sport: SportKind;
  /** Set of team IDs that currently have auto-pick enabled (LS-439) */
  autoPickTeamIds?: ReadonlySet<string>;
  /** Set of team IDs whose managers are currently online (LS-478) */
  onlineTeamIds?: ReadonlySet<string>;
}) {
  // Build a grid: rows = rounds, cols = teams
  const pickGrid = useMemo(() => {
    const grid: Record<string, DraftPickRecord | null> = {};
    for (const pick of picks) {
      const key = `${pick.round}-${pick.teamId}`;
      grid[key] = pick;
    }
    return grid;
  }, [picks]);

  // Picks grouped by team, for the footer totals. Keyed by String(teamId) to
  // match how team identity is compared everywhere else in this component —
  // team.id is a string and pick.teamId is a number.
  const picksByTeam = useMemo(() => {
    const byTeam = new Map<string, DraftPickRecord[]>();
    for (const pick of picks) {
      const key = String(pick.teamId);
      const bucket = byTeam.get(key);
      if (bucket) bucket.push(pick);
      else byTeam.set(key, [pick]);
    }
    return byTeam;
  }, [picks]);

  const rounds = Array.from({ length: maxRounds }, (_, i) => i + 1);
  const currentTeamId = normalizeTeamId(currentPickInfo?.teamId);

  return (
    <GridView>
      <GridTable
        style={{
          // Plain CSS grid sizing, deliberately not Tamagui `$token` style
          // props: structural layout derives from design-token breakpoints
          // (or useDraftViewportTier()), never from Tamagui breakpoint keys.
          // Those keys are mid-migration onto @legacy-sports/design-tokens a
          // few at a time (LS-9895 → LS-9898), so which of them still resolve
          // against @tamagui/config's stock widths changes as that lands —
          // which is exactly why layout shouldn't be pinned to them. The
          // 132px floor is option C's, widened from 100px to fit the
          // three-line cell (LS-10096).
          gridTemplateColumns: `60px repeat(${teams.length}, minmax(132px, 1fr))`,
        }}
      >
        {/* Header row */}
        <HeaderCell backgroundColor="transparent">
          <HeaderLabel>Round</HeaderLabel>
        </HeaderCell>
        {teams.map((team) => {
          const isOnClock =
            currentTeamId !== null && String(team.id) === String(currentTeamId);
          const isMyTeam = String(team.id) === String(myTeamId);
          const isOnline = onlineTeamIds.has(String(team.id));
          const isAutoPick = autoPickTeamIds.has(String(team.id));
          return (
            <HeaderCell
              key={team.id}
              onClock={isOnClock}
              borderBottomColor={isMyTeam ? EMERALD_LIGHT : undefined}
            >
              {/* Online indicator dot (LS-478) */}
              <OnlineDot
                aria-label={isOnline ? 'online' : 'offline'}
                title={isOnline ? 'Manager is online' : 'Manager is offline'}
                backgroundColor={isOnline ? EMERALD_LIGHT : OFFLINE_DOT}
              />
              <HeaderLabel onClock={isOnClock}>{team.name}</HeaderLabel>
              {isMyTeam && (
                <Text display="block" fontSize={8} color={EMERALD_LIGHT}>
                  YOU
                </Text>
              )}
              {isAutoPick && (
                <TitledText
                  display="block"
                  fontSize={10}
                  color={BLUE_LIGHT}
                  title="Auto-pick enabled"
                >
                  {/* jsx-a11y/accessible-emoji requires a literal <span> —
                      Text compiles to <span> on web but the static rule
                      doesn't recognize it (same shim used in DraftRail.tsx). */}
                  <span role="img" aria-label="robot">
                    🤖
                  </span>{' '}
                  AUTO
                </TitledText>
              )}
            </HeaderCell>
          );
        })}

        {/* Round rows */}
        {rounds.map((round) => (
          <React.Fragment key={round}>
            <RoundLabelCell>
              <Text fontWeight="700" color={TEXT_MUTED} fontSize={11}>
                {`R${round}`}
              </Text>
            </RoundLabelCell>
            {teams.map((team) => {
              const key = `${round}-${team.id}`;
              const pick = pickGrid[key];
              const isCurrent =
                currentPickInfo &&
                currentPickInfo.round === round &&
                currentTeamId !== null &&
                String(team.id) === String(currentTeamId);

              if (pick) {
                const player = statsLookup.get(pick.playerId);
                const playerName = player
                  ? player.name
                  : pick.player
                    ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
                    : `Player #${pick.playerId}`;
                const position = player?.position;
                const posColor = position
                  ? getPositionColor(sport, position)
                  : undefined;
                const isMyTeam = pick.teamId === myTeamId;
                const club = player?.club ?? pick.player?.club ?? null;
                const stat = signatureStat(player, sport);

                const value = pickValue(pick);
                const band = tintBand(value);
                const delta = formatDelta(value);
                // The value's own tint wins over the position tint when the
                // pick is a steal or a reach: the board's whole argument is
                // about value, and two competing grounds in one cell would
                // read as neither. Band 0 (on consensus, or rank unknown)
                // leaves the position tint alone.
                const ground = TINT_GROUND[band];
                const edge = TINT_BORDER[band];

                return (
                  <Cell
                    key={team.id}
                    filled
                    meTeam={isMyTeam}
                    className={isMyTeam ? 'me-team' : undefined}
                    data-pos={position ?? undefined}
                    data-v={band}
                    title={`Pick #${pick.overallPick}: ${playerName}${
                      position ? ` (${position})` : ''
                    } — ${
                      value == null
                        ? 'no consensus rank on file'
                        : `consensus #${pick.adp}, ${delta}`
                    }`}
                    style={{
                      ...(posColor
                        ? {
                            borderLeftWidth: 3,
                            borderLeftStyle: 'solid',
                            borderLeftColor: isMyTeam ? undefined : posColor,
                            backgroundColor: isMyTeam
                              ? undefined
                              : withAlpha(posColor, POS_TINT_ALPHA),
                          }
                        : {}),
                      ...(ground ? { backgroundColor: ground } : {}),
                      ...(edge && !isMyTeam ? { borderColor: edge } : {}),
                    }}
                  >
                    <CellTopLine>
                      <CellPickLabel>
                        {`#${pick.overallPick} · ${
                          pick.adp == null ? '#—' : `#${pick.adp}`
                        }`}
                      </CellPickLabel>
                      <CellDelta
                        color={valueColor(value)}
                        aria-label={
                          value == null
                            ? 'Pick value unknown — no consensus rank on file'
                            : `Pick value ${delta}`
                        }
                      >
                        {delta}
                      </CellDelta>
                    </CellTopLine>
                    <CellName
                      color={TEXT_PRIMARY}
                      fontWeight="700"
                      fontSize={12}
                      numberOfLines={1}
                    >
                      {playerName}
                    </CellName>
                    <CellTopLine>
                      <CellMeta>
                        {[position, club].filter(Boolean).join(' · ')}
                      </CellMeta>
                      {stat && (
                        <CellStat>
                          {stat.value}
                          <CellStatLabel>{stat.label}</CellStatLabel>
                        </CellStat>
                      )}
                    </CellTopLine>
                  </Cell>
                );
              }

              return (
                <Cell key={team.id} current={Boolean(isCurrent)}>
                  <CellName color={TEXT_MUTED_DIM}>
                    {isCurrent ? '🎯' : '—'}
                  </CellName>
                </Cell>
              );
            })}
          </React.Fragment>
        ))}

        {/* NET VALUE footer — one cell per team, colored by the sign of the
            sum. Picks with no consensus rank contribute nothing (teamNetValue
            skips them) rather than counting as zero. */}
        <FooterLabelCell>
          <Text
            fontFamily={FONT_DISPLAY}
            fontWeight="700"
            fontSize={9}
            letterSpacing={0.6}
            color={TEXT_MUTED}
            textAlign="center"
          >
            NET VALUE
          </Text>
        </FooterLabelCell>
        {teams.map((team) => {
          const isMyTeam = String(team.id) === String(myTeamId);
          const total = teamNetValue(picksByTeam.get(String(team.id)) ?? []);
          return (
            <FooterCell
              key={team.id}
              borderColor={isMyTeam ? BRAND_GOLD_PRESS : undefined}
            >
              <Text fontSize={8} letterSpacing={0.8} color={TEXT_MUTED}>
                {teamInitials(team.name)}
              </Text>
              <Text
                fontFamily={FONT_DISPLAY}
                fontWeight="800"
                fontSize={12}
                color={valueColor(total)}
                aria-label={`${team.name} net draft value ${formatNetValue(total)}`}
              >
                {formatNetValue(total)}
              </Text>
            </FooterCell>
          );
        })}
      </GridTable>

      {/* Tint legend. The bands quote the thresholds tintBand() uses, and the
          last entry states that the signed number — not the tint — is the
          signal every cell always carries. */}
      <LegendRow>
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={10}
          letterSpacing={0.8}
          color={TEXT_MUTED}
        >
          TINT
        </Text>
        {LEGEND_BANDS.map(({ band, label }) => (
          <YStack
            key={band}
            tag="div"
            flexDirection="row"
            alignItems="center"
            gap={0}
          >
            <LegendSwatch
              aria-hidden="true"
              backgroundColor={TINT_GROUND[band] ?? SURFACE_CARD}
              borderColor={TINT_BORDER[band] ?? OUTLINE_SUBTLE}
            />
            <Text fontSize={11} color={TEXT_SECONDARY}>
              {label}
            </Text>
          </YStack>
        ))}
        <Text fontSize={11} color={TEXT_SECONDARY}>
          Every cell shows the signed number too — pick number minus consensus
          rank. An em dash means no consensus rank is on file: the pick takes no
          tint and is left out of its team&rsquo;s net value.
        </Text>
      </LegendRow>
    </GridView>
  );
}
