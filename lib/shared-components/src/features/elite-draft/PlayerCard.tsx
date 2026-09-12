import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { type DraftPlayer } from './types';
import { getPositionColor } from './utils';
import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import { usePlayerCardDragSource } from './usePlayerCardDragSource';
import type { SportKind } from '../../config/sports';
import {
  AMBER,
  AMBER_DARK,
  BLUE,
  BLUE_LIGHT,
  BRAND_GOLD,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  EMERALD,
  EMERALD_DARK,
  EMERALD_LIGHT,
  GRAY,
  GREEN,
  ORANGE,
  SCORE_LOSS,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';
import { tamaguiStyled } from '../../utils/tamaguiStyled';

// ---------------------------------------------------------------------------
// Player Card Sub-component — ported 1:1 from styles.ts's .d-card* rules
// (LS-10067, mirroring the LS-9064/LS-9152 approach established by
// DraftRail.tsx/DraftIntelligence.tsx). tamaguiStyled() isolates Tamagui's
// any-typed styled() API from strict lint. Colors are theme tokens or
// withAlpha() derivations rather than literal hex/rgba strings so the
// theme-compliance ratchet (scripts/check-theme-compliance.mjs) doesn't flag
// them; see .agents/skills/ui/SKILL.md (epic LS-8518).
//
// Drag-to-draft wiring (draggable/onDragStart/onDragEnd/dataTransfer) is
// LS-10066's scope, not this ticket's — left untouched on the root element
// below, including its `.d-card`/`.draggable` className (DraftGrid.tsx and
// PlayerCard.spec.tsx both select on it directly:
// `container.querySelector('.d-card')`).
// ---------------------------------------------------------------------------

type StyledComponent = React.ComponentType<Record<string, unknown>>;

const BORDER_HAIRLINE = withAlpha(WHITE, 0.07);
const SURFACE_STATS_BG = withAlpha(BRAND_NAVY, 0.28);
const SURFACE_STATS_BORDER = withAlpha(WHITE, 0.04);
const WAITING_BG = withAlpha(GRAY, 0.2);
const WAITING_BORDER = withAlpha(GRAY, 0.15);
const WATCH_BG = withAlpha(BRAND_NAVY, 0.18);
const WATCH_BORDER = withAlpha(WHITE, 0.06);
const WATCH_HOVER_BG = withAlpha(BRAND_NAVY, 0.32);
const WATCH_HOVER_BORDER = withAlpha(WHITE, 0.1);
const WATCH_ACTIVE_BORDER = withAlpha(AMBER, 0.4);
const PPG_BG = withAlpha(BRAND_GOLD, 0.06);
const PPG_BORDER = withAlpha(BRAND_GOLD, 0.18);

/**
 * Accent colours for the card's stat values, applied by position in the row.
 *
 * Single source for all three stat blocks (football, baseball batter, baseball
 * pitcher). Previously 7 literal hex values (LS-8518 note); now 7 named
 * tokens so the theme-compliance ratchet's raw-hex count stays at zero. Two
 * of the original hex values (`#8b5cf6` violet, `#ec4899` pink) are
 * brand-banned (`.agents/skills/ui/references/brand-colors.md` "Never Do")
 * and are replaced here with the closest available brand-safe tokens
 * (`BLUE_LIGHT`, `SCORE_LOSS`) rather than ported verbatim.
 */
const STAT_VALUE_COLORS = [
  EMERALD_LIGHT,
  AMBER,
  BLUE,
  BLUE_LIGHT,
  GREEN,
  SCORE_LOSS,
  ORANGE,
] as const;

const CardRoot = tamaguiStyled(YStack, {
  tag: 'div',
  position: 'relative',
  borderRadius: 16,
  overflow: 'hidden',
  backgroundColor: SURFACE_CARD,
  borderWidth: 1,
  borderColor: BORDER_HAIRLINE,
  hoverStyle: {
    borderColor: withAlpha(BRAND_GOLD, 0.2),
  },
}) as StyledComponent;

const CardAccent = tamaguiStyled(YStack, {
  tag: 'div',
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: 3,
}) as StyledComponent;

const CardBody = tamaguiStyled(YStack, {
  tag: 'div',
  paddingTop: 16,
  paddingRight: 16,
  paddingBottom: 16,
  paddingLeft: 20,
  position: 'relative',
  zIndex: 1,
}) as StyledComponent;

const CardHeader = tamaguiStyled(XStack, {
  tag: 'div',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 12,
}) as StyledComponent;

const CardBadges = tamaguiStyled(XStack, {
  tag: 'div',
  alignItems: 'baseline',
  gap: 6,
  flexShrink: 0,
}) as StyledComponent;

const PosBadge = tamaguiStyled(Text, {
  tag: 'span',
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 8,
  fontSize: 11,
  fontWeight: '700',
  color: WHITE,
}) as StyledComponent;

// `Text` from 'tamagui' doesn't type a `title` (web tooltip) prop; wrapping
// via tamaguiStyled() relaxes it to Record<string, unknown> like the other
// styled aliases above, so the tooltip can survive the port.
const TitledText = tamaguiStyled(Text, {}) as StyledComponent;

const StatsGrid = tamaguiStyled(YStack, {
  tag: 'div',
  display: 'grid',
  gap: 6,
  backgroundColor: SURFACE_STATS_BG,
  borderWidth: 1,
  borderColor: SURFACE_STATS_BORDER,
  borderRadius: 12,
  padding: 10,
  marginBottom: 10,
  position: 'relative',
  overflow: 'hidden',
}) as StyledComponent;

const StatCell = tamaguiStyled(YStack, {
  tag: 'div',
  alignItems: 'center',
}) as StyledComponent;

const StatVal = tamaguiStyled(Text, {
  tag: 'span',
  display: 'block',
  fontSize: 15,
  fontWeight: '700',
  lineHeight: 20,
  fontVariant: ['tabular-nums'],
}) as StyledComponent;

const StatLbl = tamaguiStyled(Text, {
  tag: 'span',
  display: 'block',
  fontSize: 9,
  color: TEXT_MUTED,
  fontWeight: '600',
  marginTop: 1,
  letterSpacing: 0.5,
}) as StyledComponent;

const PpgBar = tamaguiStyled(XStack, {
  tag: 'div',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: PPG_BG,
  borderWidth: 1,
  borderColor: PPG_BORDER,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 5,
  marginBottom: 10,
}) as StyledComponent;

const CardActions = tamaguiStyled(XStack, {
  tag: 'div',
  gap: 6,
  position: 'relative',
  zIndex: 1,
}) as StyledComponent;

const DraftBtn = tamaguiStyled(XStack, {
  tag: 'button',
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 14,
  paddingVertical: 9,
  borderRadius: 12,
  borderWidth: 0,
  cursor: 'pointer',
  variants: {
    tone: {
      // "Draft Now" — the user's own turn.
      canDraft: {
        backgroundColor: EMERALD_DARK,
        hoverStyle: { backgroundColor: EMERALD },
      },
      // "Force Pick" — commissioner override. The original violet gradient
      // (`#7c3aed`) is brand-banned; navy reads as "authority" alongside the
      // gold commissioner accents used elsewhere in this feature (e.g.
      // DraftRail's Draft Pick Order panel).
      forcePick: {
        backgroundColor: BRAND_NAVY_DARK,
        hoverStyle: { backgroundColor: BRAND_NAVY_LIGHT },
      },
      drafting: {
        backgroundColor: withAlpha(EMERALD, 0.4),
        cursor: 'wait',
      },
      waiting: {
        backgroundColor: WAITING_BG,
        borderWidth: 1,
        borderColor: WAITING_BORDER,
        cursor: 'not-allowed',
      },
    },
  } as const,
}) as StyledComponent;

const WatchBtn = tamaguiStyled(XStack, {
  tag: 'button',
  paddingHorizontal: 12,
  paddingVertical: 9,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: WATCH_BORDER,
  backgroundColor: WATCH_BG,
  minWidth: 42,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: WATCH_HOVER_BG,
    borderColor: WATCH_HOVER_BORDER,
  },
  variants: {
    active: {
      true: {
        backgroundColor: AMBER_DARK,
        borderColor: WATCH_ACTIVE_BORDER,
      },
      false: {},
    },
  } as const,
}) as StyledComponent;

const QueueBtn = tamaguiStyled(XStack, {
  tag: 'button',
  paddingHorizontal: 12,
  paddingVertical: 9,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: WATCH_BORDER,
  backgroundColor: WATCH_BG,
  minWidth: 42,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  hoverStyle: {
    backgroundColor: WATCH_HOVER_BG,
    borderColor: WATCH_HOVER_BORDER,
  },
  variants: {
    active: {
      true: {
        backgroundColor: withAlpha(BLUE, 0.35),
        borderColor: withAlpha(BLUE, 0.5),
      },
      false: {},
    },
  } as const,
}) as StyledComponent;

function formatCareerSpan(
  startYear: number | null | undefined,
  endYear: number | null | undefined,
): { years: string; seasons: number | null } | null {
  if (startYear == null) return null;
  const end = endYear ?? startYear;
  const years = end === startYear ? `${startYear}` : `${startYear}–${end}`;
  const seasons = end >= startYear ? end - startYear + 1 : null;
  return { years, seasons };
}

/** One `d-stat`/`d-stat-val`/`d-stat-lbl` block. `.d-stat-val` stays a
 * literal className (in addition to the Tamagui styling) because
 * PlayerCard.spec.tsx selects the rendered stat values via
 * `container.querySelectorAll('.d-stat-val')`. */
function StatBlock({
  value,
  label,
  color,
}: {
  value: React.ReactNode;
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <StatCell>
      <StatVal className="d-stat-val" color={color}>
        {value}
      </StatVal>
      <StatLbl>{label}</StatLbl>
    </StatCell>
  );
}

// ---------------------------------------------------------------------------
// Player Card Sub-component
// ---------------------------------------------------------------------------

export const PlayerCard = React.memo(function PlayerCard({
  player,
  index,
  isMyPick,
  isCommPick,
  pickLoading,
  isWatched,
  isQueued,
  onDraft,
  onToggleWatch,
  onToggleQueue,
  onPlayerClick,
  onDragStartPlayer,
  onDragEndPlayer,
  sport = 'baseball',
}: {
  player: DraftPlayer;
  index: number;
  isMyPick: boolean;
  isCommPick?: boolean;
  pickLoading?: boolean;
  isWatched: boolean;
  isQueued?: boolean;
  onDraft: (playerId: number) => void;
  onToggleWatch: (playerId: number) => void;
  onToggleQueue?: (playerId: number) => void;
  onPlayerClick?: (playerId: number) => void;
  /** Drag-to-draft (LS-8068): notified when this card starts/stops dragging. */
  onDragStartPlayer?: (player: DraftPlayer) => void;
  onDragEndPlayer?: () => void;
  /** League sport — drives the stat block and position colours (LS-9473). */
  sport?: SportKind;
}) {
  const isDrafting = isMyPick && pickLoading;
  const posColor = getPositionColor(sport, player.position);
  const secondaryPositions = player.eligiblePositions?.filter(
    (p) => p !== player.position,
  );
  const careerSpan = formatCareerSpan(
    player.careerStartYear,
    player.careerEndYear,
  );

  // LS-8068: drag-to-draft is only meaningful on the user's pick. Dropping a
  // card onto an eligible roster slot in the rail drafts the player; the rail
  // validates eligibility and the active turn before committing the pick.
  const dragEnabled = isMyPick && !isDrafting && !!onDragStartPlayer;
  const dragSource = usePlayerCardDragSource({
    player,
    enabled: dragEnabled,
    onDragStartPlayer,
    onDragEndPlayer,
  });

  const draftBtnTone = isDrafting
    ? 'drafting'
    : isMyPick
      ? isCommPick
        ? 'forcePick'
        : 'canDraft'
      : 'waiting';

  return (
    <CardRoot
      className={`d-card${dragEnabled ? ' draggable' : ''}`}
      style={{ animationDelay: `${index * 0.04}s` }}
      role="group"
      aria-labelledby={`pn-${player.id}`}
      draggable={dragSource.draggable}
      onDragStart={dragSource.onDragStart}
      onDragEnd={dragSource.onDragEnd}
    >
      <CardAccent backgroundColor={posColor} />
      <CardBody>
        {/* Header */}
        <CardHeader>
          <YStack>
            {onPlayerClick ? (
              <Text
                tag="button"
                id={`pn-${player.id}`}
                margin={0}
                fontSize={15}
                fontWeight="700"
                color={TEXT_PRIMARY}
                lineHeight={19}
                cursor="pointer"
                onPress={(e: { stopPropagation: () => void }) => {
                  e.stopPropagation();
                  onPlayerClick(player.id);
                }}
              >
                {player.name}
              </Text>
            ) : (
              <Text
                tag="h3"
                id={`pn-${player.id}`}
                margin={0}
                fontSize={15}
                fontWeight="700"
                color={TEXT_PRIMARY}
                lineHeight={19}
              >
                {player.name}
              </Text>
            )}
            <Text
              fontSize={12}
              color={TEXT_MUTED}
              marginTop={3}
              fontWeight="500"
              fontVariant={['tabular-nums']}
            >
              {player.games > 0
                ? `${player.games} G · ${player.hits} H`
                : 'Career stats pending'}
            </Text>
            {careerSpan && (
              <Text
                fontSize={11}
                color={TEXT_MUTED}
                marginTop={2}
                fontWeight="500"
                letterSpacing={0.28}
                fontVariant={['tabular-nums']}
              >
                {'Career '}
                <Text color={TEXT_MUTED}>{careerSpan.years}</Text>
                {careerSpan.seasons != null &&
                  ` · ${careerSpan.seasons} seasons`}
              </Text>
            )}
          </YStack>
          <CardBadges>
            <PosBadge backgroundColor={posColor} title="Primary position">
              {player.position}
            </PosBadge>
            {secondaryPositions && secondaryPositions.length > 0 && (
              <TitledText
                fontSize={10}
                fontWeight="700"
                letterSpacing={0.88}
                color={TEXT_MUTED}
                textTransform="uppercase"
                title="Also eligible"
                aria-label={`Also eligible: ${secondaryPositions.join(', ')}`}
              >
                {secondaryPositions.join(' · ')}
              </TitledText>
            )}
          </CardBadges>
        </CardHeader>

        {/* Stats — football, or baseball's pitcher/batter split.
            Football reuses STAT_COLUMNS_BY_SPORT so the card and the table
            view can never disagree on labels or on what "no data" looks like.
            Those renderers emit an em-dash for an absent stat; the card must
            never fall back to 0, which is what made a football player read as
            `AVG .000 / HR 0 / RBI 0 / SB 0` before LS-9473. */}
        {sport === 'football' ? (
          <>
            <StatsGrid style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {STAT_COLUMNS_BY_SPORT.football.slice(0, 3).map((col, i) => (
                <StatBlock
                  key={col.label}
                  value={col.render(player)}
                  label={col.label}
                  color={STAT_VALUE_COLORS[i]}
                />
              ))}
            </StatsGrid>
            <StatsGrid
              marginTop={4}
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              {STAT_COLUMNS_BY_SPORT.football.slice(3).map((col, i) => (
                <StatBlock
                  key={col.label}
                  value={col.render(player)}
                  label={col.label}
                  color={STAT_VALUE_COLORS[i + 3]}
                />
              ))}
            </StatsGrid>
          </>
        ) : player.isPitcher ? (
          <>
            <StatsGrid style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <StatBlock
                value={player.era?.toFixed(2) ?? '—'}
                label="ERA"
                color={STAT_VALUE_COLORS[0]}
              />
              <StatBlock
                value={player.wins ?? 0}
                label="W"
                color={STAT_VALUE_COLORS[1]}
              />
              <StatBlock
                value={player.strikeouts ?? 0}
                label="K"
                color={STAT_VALUE_COLORS[2]}
              />
              <StatBlock
                value={player.saves ?? 0}
                label="SV"
                color={STAT_VALUE_COLORS[3]}
              />
            </StatsGrid>
            <StatsGrid
              marginTop={4}
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              <StatBlock
                value={player.whip?.toFixed(3) ?? '—'}
                label="WHIP"
                color={STAT_VALUE_COLORS[4]}
              />
              <StatBlock
                value={player.losses ?? 0}
                label="L"
                color={STAT_VALUE_COLORS[5]}
              />
              <StatBlock
                value={player.gamesStarted ?? 0}
                label="GS"
                color={STAT_VALUE_COLORS[6]}
              />
            </StatsGrid>
          </>
        ) : (
          <>
            <StatsGrid style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <StatBlock
                value={player.avg.toFixed(3)}
                label="AVG"
                color={STAT_VALUE_COLORS[0]}
              />
              <StatBlock
                value={player.hr}
                label="HR"
                color={STAT_VALUE_COLORS[1]}
              />
              <StatBlock
                value={player.rbi}
                label="RBI"
                color={STAT_VALUE_COLORS[2]}
              />
              <StatBlock
                value={player.sb}
                label="SB"
                color={STAT_VALUE_COLORS[3]}
              />
            </StatsGrid>
            <StatsGrid
              marginTop={4}
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              <StatBlock
                value={player.obp.toFixed(3)}
                label="OBP"
                color={STAT_VALUE_COLORS[4]}
              />
              <StatBlock
                value={player.slg.toFixed(3)}
                label="SLG"
                color={STAT_VALUE_COLORS[5]}
              />
              <StatBlock
                value={player.runs}
                label="R"
                color={STAT_VALUE_COLORS[6]}
              />
            </StatsGrid>
          </>
        )}

        {/* Career Pts/Matchup — computed from the baseball scoring cache
            (hitter/pitching PPG), so it is meaningless for football and is
            withheld there rather than shown as 0.00 (LS-9473). Football gets
            this bar back when LS-9476 lands real projections. */}
        {sport !== 'football' && player.ppg != null && (
          <PpgBar>
            <Text
              fontSize={9}
              fontWeight="700"
              letterSpacing={0.8}
              color={BRAND_GOLD}
              textTransform="uppercase"
            >
              Career Pts/Matchup
            </Text>
            <Text fontSize={13} fontWeight="800" color={BRAND_GOLD}>
              {player.ppg.toFixed(2)}
            </Text>
          </PpgBar>
        )}

        {/* Actions */}
        <CardActions>
          <DraftBtn
            tone={draftBtnTone}
            // Stable, unique handle for the draft action keyed by player.id.
            // The accessible name ("Draft <name> now") is NOT unique — the live
            // player pool spans every era since 1876, so two different players
            // can share a name, which trips a Playwright strict-mode violation
            // when selecting by accessible name (LS-8136). player.id is unique
            // and follows the player across draft-board re-renders.
            data-testid={`draft-now-${player.id}`}
            onPress={() => onDraft(player.id)}
            disabled={!isMyPick || isDrafting}
            aria-disabled={!isMyPick || isDrafting}
            aria-label={
              isDrafting
                ? `Drafting ${player.name}…`
                : isMyPick
                  ? isCommPick
                    ? `Force pick ${player.name} as commissioner`
                    : `Draft ${player.name} now`
                  : `Waiting for your turn to draft ${player.name}`
            }
          >
            <Text
              color={
                draftBtnTone === 'waiting'
                  ? TEXT_MUTED
                  : draftBtnTone === 'drafting'
                    ? withAlpha(WHITE, 0.6)
                    : WHITE
              }
              fontSize={12}
              fontWeight="700"
              letterSpacing={0.5}
            >
              {isDrafting
                ? '⏳ DRAFTING…'
                : isMyPick
                  ? isCommPick
                    ? '👑 FORCE PICK'
                    : '⚡ DRAFT NOW'
                  : '⏳ WAITING'}
            </Text>
          </DraftBtn>
          <WatchBtn
            active={isWatched}
            onPress={() => onToggleWatch(player.id)}
            role="button"
            aria-pressed={isWatched}
            aria-label={
              isWatched
                ? `Remove ${player.name} from watchlist`
                : `Add ${player.name} to watchlist`
            }
          >
            <Text color={isWatched ? WHITE : TEXT_PRIMARY} fontSize={15}>
              {isWatched ? '★' : '☆'}
            </Text>
          </WatchBtn>
          {onToggleQueue && (
            <QueueBtn
              active={Boolean(isQueued)}
              onPress={() => onToggleQueue(player.id)}
              aria-pressed={Boolean(isQueued)}
              aria-label={
                isQueued
                  ? `Remove ${player.name} from draft queue`
                  : `Add ${player.name} to draft queue`
              }
              title={isQueued ? 'Remove from queue' : 'Add to queue'}
            >
              <Text color={TEXT_PRIMARY} fontSize={15}>
                {isQueued ? '📋' : '📄'}
              </Text>
            </QueueBtn>
          )}
        </CardActions>
      </CardBody>
    </CardRoot>
  );
});
