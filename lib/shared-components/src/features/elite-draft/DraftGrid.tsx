import React, { useMemo } from 'react';
import { Text, YStack } from 'tamagui';
import {
  type CurrentDraftPickInfo,
  type DraftPickRecord,
  type DraftPlayer,
  type LeagueTeam,
} from './types';
import { getPositionColor, normalizeTeamId } from './utils';
import type { SportKind } from '../../config/sports';
import {
  BLUE_LIGHT,
  BRAND_GOLD,
  EMERALD_LIGHT,
  OUTLINE_SUBTLE,
  SLATE_400,
  TEXT_MUTED,
  TEXT_PRIMARY,
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
  minHeight: 28,
  paddingHorizontal: 4,
  paddingVertical: 5,
  backgroundColor: SURFACE_OVERLAY_FAINT,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  hoverStyle: {},
  variants: {
    filled: {
      true: {
        backgroundColor: SURFACE_OVERLAY_SUBTLE,
        hoverStyle: { backgroundColor: SURFACE_OVERLAY_STRONG },
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

const CellPosGlyph = tamaguiStyled(Text, {
  position: 'absolute',
  bottom: 1,
  right: 4,
  fontFamily: FONT_DISPLAY,
  fontWeight: '800',
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0.6,
  opacity: 0.22,
  pointerEvents: 'none',
  color: TEXT_PRIMARY,
}) as StyledComponent;

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

  const rounds = Array.from({ length: maxRounds }, (_, i) => i + 1);
  const currentTeamId = normalizeTeamId(currentPickInfo?.teamId);

  return (
    <GridView>
      <GridTable
        style={{
          gridTemplateColumns: `60px repeat(${teams.length}, minmax(100px, 1fr))`,
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
                return (
                  <Cell
                    key={team.id}
                    filled
                    meTeam={isMyTeam}
                    className={isMyTeam ? 'me-team' : undefined}
                    data-pos={position ?? undefined}
                    title={`Pick #${pick.overallPick}: ${playerName}${position ? ` (${position})` : ''}`}
                    style={
                      posColor
                        ? {
                            borderLeftWidth: 3,
                            borderLeftStyle: 'solid',
                            borderLeftColor: isMyTeam ? undefined : posColor,
                            backgroundColor: isMyTeam
                              ? undefined
                              : withAlpha(posColor, POS_TINT_ALPHA),
                          }
                        : undefined
                    }
                  >
                    <CellName color={TEXT_PRIMARY} fontWeight="600">
                      {playerName}
                    </CellName>
                    {position && (
                      <CellPosGlyph
                        aria-hidden="true"
                        color={posColor}
                        opacity={posColor ? 0.55 : 0.22}
                      >
                        {position}
                      </CellPosGlyph>
                    )}
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
      </GridTable>
    </GridView>
  );
}
