import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { H4, styled, Text } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';
import type { PlayerMatchupData } from '../../pages/baseball/LeagueDetailPage';

// ── Constants ──────────────────────────────────────────────────────────────────

const PITCHING_POSITIONS = new Set(['SP', 'RP']);
const pitchingPositions = new Set(['SP', 'RP']);
const infieldPositions = new Set(['C', '1B', '2B', '3B', 'SS']);
const outfieldPositions = new Set(['LF', 'CF', 'RF', 'OF']);
const utilityPositions = new Set(['IF', 'XDH', 'DH']);

// ── Helpers ────────────────────────────────────────────────────────────────────

const getPlayerName = (
  teamMember: TeamMemberFragment | null | undefined,
): string => {
  if (!teamMember?.player) return 'Empty';
  const { firstName, lastName } = teamMember.player;
  return `${firstName || ''} ${lastName || ''}`.trim() || 'Empty';
};

const getEligiblePositions = (player: TeamMemberFragment): string[] =>
  player.player?.eligiblePositions ?? [];

const isPlayerPitcher = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => PITCHING_POSITIONS.has(pos));

const isPlayerBatter = (player: TeamMemberFragment): boolean =>
  getEligiblePositions(player).some((pos) => !PITCHING_POSITIONS.has(pos));

const isDualEligible = (player: TeamMemberFragment): boolean =>
  isPlayerPitcher(player) && isPlayerBatter(player);

const ALLOWED_POSITIONS: Record<string, string[]> = {
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  C: ['C'],
  CF: ['CF'],
  DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
  IF: ['1B', '2B', '3B', 'SS'],
  LF: ['LF'],
  OF: ['LF', 'RF', 'CF'],
  RF: ['RF'],
  RP: ['RP'],
  SP: ['SP'],
  SS: ['SS'],
  XDH: ['DH'],
};

export const canPlayerPlayPosition = (
  player: TeamMemberFragment,
  position: LeaguePositionFragment,
): boolean => {
  const eligible = getEligiblePositions(player);
  if (eligible.length === 0) return true;
  const allowed = ALLOWED_POSITIONS[position.positionType ?? ''];
  if (!allowed) return false;
  return eligible.some((pos) => allowed.includes(pos));
};

type PositionCategory = 'pitching' | 'infield' | 'outfield' | 'utility';

const getPositionCategory = (positionType: string): PositionCategory => {
  if (pitchingPositions.has(positionType)) return 'pitching';
  if (infieldPositions.has(positionType)) return 'infield';
  if (outfieldPositions.has(positionType)) return 'outfield';
  return 'utility';
};

const CATEGORY_COLORS: Record<
  PositionCategory,
  { bg: string; text: string; border: string }
> = {
  pitching: {
    bg: 'rgba(59, 130, 246, 0.28)',
    text: '$blue11',
    border: '$blue7',
  },
  infield: {
    bg: 'rgba(220, 38, 38, 0.22)',
    text: '$sportBaseballSecondary',
    border: '$red6',
  },
  outfield: {
    bg: 'rgba(34, 197, 94, 0.22)',
    text: '$green9',
    border: '$green7',
  },
  utility: {
    bg: 'rgba(245, 158, 11, 0.24)',
    text: '$amber8',
    border: '$amber7',
  },
};

const POSITION_DISPLAY_NAMES: Record<string, string> = {
  SP: 'Starting Pitcher',
  RP: 'Relief Pitcher',
  C: 'Catcher',
  '1B': '1st Base',
  '2B': '2nd Base',
  '3B': '3rd Base',
  SS: 'Shortstop',
  LF: 'Left Field',
  CF: 'Center Field',
  RF: 'Right Field',
  OF: 'Outfield',
  IF: 'Infield Flex',
  DH: 'Designated Hitter',
  XDH: 'Extra Hitter',
};

const getPositionDisplayName = (positionType: string): string =>
  POSITION_DISPLAY_NAMES[positionType] ?? positionType;

// ── Move-flash CSS keyframe (injected once) ───────────────────────────────────

const FLASH_STYLE_ID = 'roster-move-flash';
const FLASH_DURATION_MS = 1200;

function ensureFlashStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FLASH_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FLASH_STYLE_ID;
  style.textContent = `
    @keyframes roster-flash-green {
      0%   { box-shadow: inset 0 0 40px rgba(34, 197, 94, 0.35), 0 0 16px rgba(34, 197, 94, 0.2); }
      50%  { box-shadow: inset 0 0 20px rgba(34, 197, 94, 0.18), 0 0 8px rgba(34, 197, 94, 0.1); }
      100% { box-shadow: none; }
    }
    .roster-flash {
      animation: roster-flash-green ${FLASH_DURATION_MS}ms ease-out;
    }
  `;
  document.head.appendChild(style);
}

// ── Styled Primitives ──────────────────────────────────────────────────────────

const GlassHeader = styled(XStack, {
  position: 'sticky' as const,
  top: 0,
  zIndex: 100,
  backgroundColor: '$background075',
  backdropFilter: 'blur(12px)',
  paddingVertical: '$3',
  paddingHorizontal: '$4',
  borderBottomWidth: 1,
  borderBottomColor: '$outlineSubtle',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '$3',
});

const StatPill = styled(YStack, {
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  borderRadius: '$10',
  borderWidth: 1,
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 72,
  animation: 'quick',
  cursor: 'default',
  hoverStyle: { scale: 1.06, borderColor: '$blue7' },
  pressStyle: { scale: 0.97 },
});

const PositionBadge = styled(YStack, {
  width: 44,
  height: 44,
  borderRadius: '$5',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderWidth: 1,
  animation: 'quick',
  hoverStyle: { scale: 1.1 },
});

const TableHeaderRow = styled(XStack, {
  paddingVertical: '$2',
  paddingHorizontal: '$3',
  width: '100%',
});

// ── Stat Pill Component ────────────────────────────────────────────────────────

interface QuickStatProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'positive' | 'warning';
}

function QuickStat({
  label,
  value,
  tone = 'default',
}: QuickStatProps): React.JSX.Element {
  const bg =
    tone === 'positive'
      ? '$green3'
      : tone === 'warning'
        ? '$amber3'
        : '$surfaceSubtle';
  const border =
    tone === 'positive'
      ? '$green7'
      : tone === 'warning'
        ? '$amber7'
        : '$outlineSubtle';
  const color =
    tone === 'positive'
      ? '$green9'
      : tone === 'warning'
        ? '$amber9'
        : '$color12';

  return (
    <StatPill backgroundColor={bg} borderColor={border}>
      <Text
        fontSize="$1"
        fontWeight="600"
        color="$textMuted"
        textTransform="uppercase"
        letterSpacing={0.8}
      >
        {label}
      </Text>
      <Text fontSize="$4" fontWeight="800" color={color}>
        {value}
      </Text>
    </StatPill>
  );
}

// ── Table Row for a single roster slot ─────────────────────────────────────────

interface RosterRowProps {
  position: LeaguePositionFragment;
  assignedPlayer?: TeamMemberFragment | null;
  selectedPlayer: TeamMemberFragment | null;
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerSwap: (
    incomingPlayer: TeamMemberFragment,
    targetPosition: LeaguePositionFragment,
    displacedPlayer: TeamMemberFragment,
  ) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  isSelected: boolean;
  recentlyMoved: boolean;
  matchupData?: PlayerMatchupData;
}

function RosterRow({
  position,
  assignedPlayer,
  selectedPlayer,
  onPlayerAssign,
  onPlayerSwap,
  onPlayerSelect,
  isSelected,
  recentlyMoved,
  matchupData,
}: RosterRowProps): React.JSX.Element {
  const isLocked = Boolean(matchupData?.isLocked);
  const posType = position.positionType ?? '';
  const category = getPositionCategory(posType);
  const colors = CATEGORY_COLORS[category];
  const hasPlayer = Boolean(assignedPlayer);
  const canAccept = Boolean(
    selectedPlayer && canPlayerPlayPosition(selectedPlayer, position),
  );
  const isSwapTarget = Boolean(
    selectedPlayer &&
    canAccept &&
    hasPlayer &&
    assignedPlayer?.id !== selectedPlayer.id,
  );

  const handlePress = useCallback(() => {
    if (isLocked) {
      // Locked players cannot be moved — do nothing
      return;
    }
    if (selectedPlayer) {
      if (hasPlayer && assignedPlayer) {
        if (assignedPlayer.id === selectedPlayer.id) {
          // Clicking the already-selected player — deselect
          onPlayerSelect(null);
        } else if (canAccept) {
          // Occupied slot & selected can play here — swap
          onPlayerSwap(selectedPlayer, position, assignedPlayer);
          onPlayerSelect(null);
        } else {
          // Can't play here — switch selection to this player
          onPlayerSelect(assignedPlayer);
        }
      } else if (!hasPlayer && canAccept) {
        // Empty slot — assign
        onPlayerAssign(selectedPlayer, position);
        onPlayerSelect(null);
      } else {
        // Empty slot but can't accept — deselect
        onPlayerSelect(null);
      }
    } else {
      // No selection — select this player
      if (hasPlayer && assignedPlayer) {
        onPlayerSelect(assignedPlayer);
      }
    }
  }, [
    isLocked,
    hasPlayer,
    assignedPlayer,
    selectedPlayer,
    canAccept,
    onPlayerAssign,
    onPlayerSwap,
    onPlayerSelect,
    position,
  ]);

  const eligible = assignedPlayer ? getEligiblePositions(assignedPlayer) : [];

  const positionLabel = getPositionDisplayName(posType);

  const rowBg = isSelected
    ? '$accentMuted'
    : isSwapTarget
      ? '$successMuted'
      : canAccept && !hasPlayer
        ? '$successMuted'
        : 'transparent';

  const hoverBg = isSelected
    ? '$accentMuted'
    : isSwapTarget || (canAccept && !hasPlayer)
      ? '$successMuted'
      : '$surfaceCard';

  const rowGlow = isSelected
    ? 'inset 0 0 30px rgba(59, 130, 246, 0.12)'
    : isSwapTarget
      ? 'inset 0 0 30px rgba(34, 197, 94, 0.12)'
      : canAccept && !hasPlayer
        ? 'inset 0 0 20px rgba(34, 197, 94, 0.06)'
        : 'none';

  // Gradient backgrounds for eligible/swap-target rows
  const rowGradient = isSelected
    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.18) 0%, rgba(139, 92, 246, 0.10) 100%)'
    : isSwapTarget
      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(59, 130, 246, 0.10) 100%)'
      : canAccept && !hasPlayer
        ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.16) 0%, rgba(34, 197, 94, 0.04) 100%)'
        : undefined;

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePress();
    }
  };

  return (
    <XStack
      animation="quick"
      paddingVertical="$3"
      paddingHorizontal="$3"
      backgroundColor={rowBg}
      hoverStyle={{ backgroundColor: hoverBg }}
      pressStyle={{ scale: 0.995, opacity: 0.9 }}
      cursor="pointer"
      onPress={handlePress}
      opacity={isLocked ? 0.7 : 1}
      style={{
        boxShadow: rowGlow,
        transition: 'box-shadow 0.3s ease, background 0.3s ease',
        ...(rowGradient ? { background: rowGradient } : {}),
      }}
      className={recentlyMoved ? 'roster-flash' : undefined}
      role="button"
      tabIndex={isLocked ? -1 : 0}
      aria-pressed={isSelected}
      aria-disabled={isLocked}
      aria-label={
        isSwapTarget
          ? `Swap ${getPlayerName(selectedPlayer)} into ${posType}`
          : hasPlayer
            ? `${getPlayerName(assignedPlayer)} at ${posType}`
            : canAccept
              ? `Assign selected player to ${posType}`
              : `${posType} — open slot`
      }
      onKeyDown={onKeyDown}
      alignItems="center"
      gap="$3"
      minHeight={64}
      width="100%"
      borderBottomWidth={1}
      borderBottomColor="#1C2740"
    >
      {/* Position Badge */}
      <PositionBadge backgroundColor={colors.bg} borderColor={colors.border}>
        <Text fontSize="$2" fontWeight="800" color={colors.text}>
          {posType}
        </Text>
      </PositionBadge>

      {/* Player Name & Eligibility */}
      <YStack flex={1} minWidth={0} gap="$1">
        <Text fontSize="$3" fontWeight="700" color="#F5F7FA" numberOfLines={1}>
          {hasPlayer ? getPlayerName(assignedPlayer) : positionLabel}
        </Text>
        {hasPlayer && eligible.length > 0 && (
          <XStack gap="$1" flexWrap="wrap">
            {eligible.map((pos) => (
              <Text
                key={pos}
                fontSize={10}
                fontWeight="700"
                color={PITCHING_POSITIONS.has(pos) ? '#93C5FD' : '#86EFAC'}
                backgroundColor={
                  PITCHING_POSITIONS.has(pos)
                    ? 'rgba(59, 130, 246, 0.18)'
                    : 'rgba(34, 197, 94, 0.16)'
                }
                paddingHorizontal="$1.5"
                paddingVertical={2}
                borderRadius="$2"
              >
                {pos}
              </Text>
            ))}
          </XStack>
        )}
        {!hasPlayer && (
          <Text fontSize="$2" color="#9CAAC5">
            {canAccept && selectedPlayer
              ? `Tap to assign ${getPlayerName(selectedPlayer)}`
              : 'Select a bench player to fill this spot'}
          </Text>
        )}
        {isSwapTarget && (
          <Text fontSize="$2" color="#86EFAC" fontWeight="600">
            Tap to swap with {getPlayerName(selectedPlayer)}
          </Text>
        )}
      </YStack>

      {/* Score & Projection */}
      {matchupData && hasPlayer && (
        <XStack alignItems="center" gap="$3" flexShrink={0}>
          <YStack alignItems="center" minWidth={36}>
            <Text
              fontSize={10}
              fontWeight="600"
              color="#9CAAC5"
              lineHeight={12}
            >
              Score
            </Text>
            <Text fontSize="$3" fontWeight="700" color="#F5F7FA">
              {matchupData.score.toFixed(1)}
            </Text>
          </YStack>
          <YStack alignItems="center" minWidth={36}>
            <Text
              fontSize={10}
              fontWeight="600"
              color="#9CAAC5"
              lineHeight={12}
            >
              Proj
            </Text>
            <Text fontSize="$3" fontWeight="700" color="#93C5FD">
              {matchupData.projection.toFixed(1)}
            </Text>
          </YStack>
        </XStack>
      )}

      {/* Status / Action */}
      <XStack
        alignItems="center"
        gap="$2"
        flexShrink={0}
        minWidth={52}
        justifyContent="flex-end"
      >
        {isLocked ? (
          <XStack alignItems="center" gap="$1">
            <Lock size={14} color="#FBBF24" />
            <Text fontSize="$2" fontWeight="600" color="#FBBF24">
              Locked
            </Text>
          </XStack>
        ) : isSwapTarget ? (
          <Text fontSize="$2" fontWeight="700" color="#86EFAC">
            Swap
          </Text>
        ) : hasPlayer ? (
          <Text fontSize="$2" fontWeight="600" color="#9CAAC5">
            {isSelected ? 'Selected' : ''}
          </Text>
        ) : (
          <Text
            fontSize="$2"
            color={canAccept ? '#86EFAC' : '#9CAAC5'}
            fontWeight="600"
          >
            {canAccept ? 'Ready' : 'Open'}
          </Text>
        )}
      </XStack>
    </XStack>
  );
}

// ── Section: a group of roster slots (e.g. Pitching, Infield, etc.) ────────

interface RosterSectionProps {
  title: string;
  positions: readonly LeaguePositionFragment[];
  getAssignedPlayer: (
    position: LeaguePositionFragment,
  ) => TeamMemberFragment | undefined;
  selectedPlayer: TeamMemberFragment | null;
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerSwap: (
    incomingPlayer: TeamMemberFragment,
    targetPosition: LeaguePositionFragment,
    displacedPlayer: TeamMemberFragment,
  ) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  recentlyMovedIds: ReadonlySet<number>;
  playerMatchupData?: ReadonlyMap<number, PlayerMatchupData>;
}

function RosterSection({
  title,
  positions,
  getAssignedPlayer,
  selectedPlayer,
  onPlayerAssign,
  onPlayerSwap,
  onPlayerSelect,
  recentlyMovedIds,
  playerMatchupData,
}: RosterSectionProps): React.JSX.Element | null {
  if (positions.length === 0) return null;

  const filled = positions.filter((p) => Boolean(getAssignedPlayer(p))).length;
  const fillPct = positions.length > 0 ? (filled / positions.length) * 100 : 0;

  return (
    <YStack>
      {/* Section header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        backgroundColor="#0D1526"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="#1C2740"
        borderTopWidth={1}
        borderTopColor="#1C2740"
        position="relative"
        overflow="hidden"
      >
        {/* Fill progress bar */}
        <YStack
          position="absolute"
          left={0}
          top={0}
          bottom={0}
          width={`${fillPct}%`}
          opacity={0.08}
          style={{
            background:
              'linear-gradient(90deg, rgba(34, 197, 94, 0.6), rgba(59, 130, 246, 0.4))',
            transition: 'width 0.5s ease-out',
          }}
        />
        <Text
          fontSize="$2"
          fontWeight="700"
          color="#F5F7FA"
          textTransform="uppercase"
          letterSpacing={1}
        >
          {title}
        </Text>
        <Text
          fontSize="$2"
          color={filled === positions.length ? '#86EFAC' : '#9CAAC5'}
          fontWeight="600"
        >
          {filled}/{positions.length}
        </Text>
      </XStack>

      {/* Slot rows */}
      {positions.map((position, index) => {
        const assigned = getAssignedPlayer(position);
        const mData = assigned?.playerId
          ? playerMatchupData?.get(assigned.playerId)
          : undefined;
        return (
          <RosterRow
            key={position.id}
            position={position}
            assignedPlayer={assigned}
            selectedPlayer={selectedPlayer}
            onPlayerAssign={onPlayerAssign}
            onPlayerSwap={onPlayerSwap}
            onPlayerSelect={onPlayerSelect}
            isSelected={
              Boolean(assigned) && assigned?.id === selectedPlayer?.id
            }
            recentlyMoved={
              Boolean(
                assigned?.id != null && recentlyMovedIds.has(assigned.id),
              ) ||
              (position.id != null && recentlyMovedIds.has(position.id))
            }
            matchupData={mData}
          />
        );
      })}
    </YStack>
  );
}

// ── Bench / Bullpen Player Card ────────────────────────────────────────────

interface BenchPlayerCardProps {
  player: TeamMemberFragment;
  isActive: boolean;
  onSelect: () => void;
  accentColor: string;
  recentlyMoved: boolean;
  matchupData?: PlayerMatchupData;
}

function BenchPlayerCard({
  player,
  isActive,
  onSelect,
  accentColor,
  recentlyMoved,
  matchupData,
}: BenchPlayerCardProps): React.JSX.Element {
  const isLocked = Boolean(matchupData?.isLocked);
  const eligible = getEligiblePositions(player);
  const dual = isDualEligible(player);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isLocked) onSelect();
    }
  };

  return (
    <XStack
      animation="quick"
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      backgroundColor={isActive ? '$accentMuted' : 'transparent'}
      hoverStyle={{
        backgroundColor: isActive
          ? '$accentMuted'
          : isLocked
            ? 'transparent'
            : '$surfaceSubtle',
      }}
      pressStyle={isLocked ? undefined : { scale: 0.995, opacity: 0.9 }}
      cursor={isLocked ? 'default' : 'pointer'}
      onPress={isLocked ? undefined : onSelect}
      opacity={isLocked ? 0.7 : 1}
      style={
        isActive
          ? { boxShadow: 'inset 0 0 24px rgba(59, 130, 246, 0.12)' }
          : undefined
      }
      role="button"
      tabIndex={isLocked ? -1 : 0}
      aria-pressed={isActive}
      aria-disabled={isLocked}
      onKeyDown={onKeyDown}
      alignItems="center"
      gap="$3"
      minHeight={48}
      borderLeftWidth={3}
      borderLeftColor={isActive ? accentColor : 'transparent'}
      className={recentlyMoved ? 'roster-flash' : undefined}
    >
      {/* Player info */}
      <YStack flex={1} minWidth={0} gap="$0.5">
        <Text fontSize="$3" fontWeight="600" color="$color12" numberOfLines={1}>
          {getPlayerName(player)}
        </Text>
        {eligible.length > 0 && (
          <XStack gap="$1" flexWrap="wrap">
            {eligible.map((pos) => (
              <Text
                key={pos}
                fontSize={10}
                fontWeight="700"
                color={PITCHING_POSITIONS.has(pos) ? '$blue11' : '$green9'}
                backgroundColor={
                  PITCHING_POSITIONS.has(pos)
                    ? 'rgba(59, 130, 246, 0.18)'
                    : 'rgba(34, 197, 94, 0.16)'
                }
                paddingHorizontal="$1.5"
                paddingVertical={2}
                borderRadius="$2"
              >
                {pos}
              </Text>
            ))}
            {dual && (
              <Text
                fontSize={10}
                fontWeight="800"
                color="$amber8"
                backgroundColor="rgba(245, 158, 11, 0.20)"
                paddingHorizontal="$1"
                paddingVertical={1}
                borderRadius="$1"
              >
                2-WAY
              </Text>
            )}
          </XStack>
        )}
      </YStack>

      {/* Score & Projection */}
      {matchupData && (
        <XStack alignItems="center" gap="$2" flexShrink={0}>
          <YStack alignItems="center" minWidth={32}>
            <Text
              fontSize={9}
              fontWeight="600"
              color="$textMuted"
              lineHeight={11}
            >
              Score
            </Text>
            <Text fontSize="$2" fontWeight="700" color="$color12">
              {matchupData.score.toFixed(1)}
            </Text>
          </YStack>
          <YStack alignItems="center" minWidth={32}>
            <Text
              fontSize={9}
              fontWeight="600"
              color="$textMuted"
              lineHeight={11}
            >
              Proj
            </Text>
            <Text fontSize="$2" fontWeight="700" color="#93C5FD">
              {matchupData.projection.toFixed(1)}
            </Text>
          </YStack>
        </XStack>
      )}

      {/* Selection indicator */}
      {isLocked ? (
        <XStack alignItems="center" gap="$1" flexShrink={0}>
          <Lock size={12} color="#FBBF24" />
          <Text fontSize="$2" fontWeight="600" color="#FBBF24">
            Locked
          </Text>
        </XStack>
      ) : (
        <Text
          fontSize="$2"
          fontWeight={isActive ? '700' : '400'}
          color={isActive ? accentColor : '$textMuted'}
        >
          {isActive ? 'Selected' : 'Select'}
        </Text>
      )}
    </XStack>
  );
}

// ── Bench List Panel ───────────────────────────────────────────────────────

interface BenchPanelProps {
  players: readonly TeamMemberFragment[];
  selectedPlayer: TeamMemberFragment | null;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  onBench?: (player: TeamMemberFragment) => void;
  title: string;
  titleId: string;
  emptyLabel: string;
  emptyHint: string;
  accentColor: string;
  recentlyMovedIds: ReadonlySet<number>;
  playerMatchupData?: ReadonlyMap<number, PlayerMatchupData>;
}

function BenchPanel({
  players,
  selectedPlayer,
  onPlayerSelect,
  onBench,
  title,
  titleId,
  emptyLabel,
  emptyHint,
  accentColor,
  recentlyMovedIds,
  playerMatchupData,
}: BenchPanelProps): React.JSX.Element {
  const isFromLineup = Boolean(selectedPlayer?.positionId);
  const selectedPlayerLocked = Boolean(
    selectedPlayer?.playerId &&
    playerMatchupData?.get(selectedPlayer.playerId)?.isLocked,
  );
  const canBench = Boolean(
    onBench && selectedPlayer && isFromLineup && !selectedPlayerLocked,
  );

  const handleBenchPress = useCallback(() => {
    if (onBench && selectedPlayer && canBench) {
      onBench(selectedPlayer);
    }
  }, [onBench, selectedPlayer, canBench]);

  const onBenchKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleBenchPress();
    }
  };
  return (
    <YStack
      backgroundColor="rgba(17, 27, 47, 0.7)"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$5"
      overflow="hidden"
      role="region"
      aria-labelledby={titleId}
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Gradient accent bar */}
      <YStack
        height={2}
        width="100%"
        style={{
          background:
            accentColor === '$green9'
              ? 'linear-gradient(90deg, #22C55E, #4ADE80, transparent)'
              : 'linear-gradient(90deg, #3B82F6, #60A5FA, transparent)',
        }}
      />
      {/* Panel header */}
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$2.5"
        backgroundColor="rgba(13, 21, 38, 0.6)"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text
          id={titleId}
          fontSize="$2"
          fontWeight="700"
          color="$textMuted"
          textTransform="uppercase"
          letterSpacing={1}
        >
          {title}
        </Text>
        <Text fontSize="$2" color="$textMuted" fontWeight="500">
          {players.length}
        </Text>
      </XStack>

      {players.length === 0 && !canBench ? (
        <YStack padding="$5" alignItems="center" gap="$1.5">
          <Text fontSize="$3" fontWeight="500" color="$textMuted">
            {emptyLabel}
          </Text>
          <Text fontSize="$2" color="$textMuted" textAlign="center">
            {emptyHint}
          </Text>
        </YStack>
      ) : (
        <YStack>
          {/* Bench player cards */}
          {players.map((player, index) => (
            <React.Fragment key={player.id}>
              <BenchPlayerCard
                player={player}
                isActive={selectedPlayer?.id === player.id}
                onSelect={() =>
                  onPlayerSelect(
                    selectedPlayer?.id === player.id ? null : player,
                  )
                }
                accentColor={accentColor}
                recentlyMoved={
                  player.id != null && recentlyMovedIds.has(player.id)
                }
                matchupData={
                  player.playerId
                    ? playerMatchupData?.get(player.playerId)
                    : undefined
                }
              />
              {index < players.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginVertical={0} />
              )}
            </React.Fragment>
          ))}

          {/* Move-to-bench target row (only when a lineup player is selected) */}
          {onBench && canBench && (
            <>
              {players.length > 0 && (
                <Separator borderColor="$outlineSubtle" marginVertical={0} />
              )}
              <XStack
                animation="quick"
                paddingVertical="$2.5"
                paddingHorizontal="$3"
                backgroundColor="$successMuted"
                hoverStyle={{ backgroundColor: '$successMuted' }}
                pressStyle={{ scale: 0.995, opacity: 0.9 }}
                cursor="pointer"
                onPress={handleBenchPress}
                style={{
                  boxShadow: 'inset 0 0 20px rgba(34, 197, 94, 0.1)',
                  background:
                    'linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(59, 130, 246, 0.10) 100%)',
                  transition: 'box-shadow 0.3s ease, background 0.3s ease',
                }}
                role="button"
                tabIndex={0}
                aria-label={`Move ${getPlayerName(selectedPlayer)} to bench`}
                onKeyDown={onBenchKeyDown}
                alignItems="center"
                gap="$3"
                minHeight={48}
                borderLeftWidth={3}
                borderLeftColor="$green9"
              >
                <YStack flex={1} minWidth={0} gap="$0.5">
                  <Text fontSize="$3" fontWeight="600" color="$color12">
                    Move {getPlayerName(selectedPlayer)} here
                  </Text>
                  <Text fontSize="$2" color="$green9" fontWeight="500">
                    Tap to remove from lineup
                  </Text>
                </YStack>
                <Text fontSize="$2" fontWeight="700" color="$green9">
                  Ready
                </Text>
              </XStack>
            </>
          )}
        </YStack>
      )}
    </YStack>
  );
}

// ── Selected Player Banner ─────────────────────────────────────────────────

interface SelectedBannerProps {
  player: TeamMemberFragment;
  onClear: () => void;
}

function SelectedBanner({
  player,
  onClear,
}: SelectedBannerProps): React.JSX.Element {
  return (
    <XStack
      backgroundColor="$blue3"
      borderColor="$blue7"
      borderWidth={1}
      borderRadius="$4"
      paddingVertical="$2"
      paddingHorizontal="$3"
      alignItems="center"
      justifyContent="space-between"
      gap="$3"
      flexWrap="wrap"
      animation="bouncy"
      enterStyle={{ opacity: 0, y: -10, scale: 0.98 }}
      style={{ boxShadow: '0 0 24px rgba(59, 130, 246, 0.2)' }}
    >
      <XStack alignItems="center" gap="$2">
        <YStack
          width={8}
          height={8}
          borderRadius={4}
          backgroundColor="$blue9"
          animation="bouncy"
          enterStyle={{ scale: 0 }}
        />
        <Text fontSize="$3" fontWeight="700" color="$blue11">
          {getPlayerName(player)}
        </Text>
        <Text fontSize="$2" color="$blue10">
          — tap a slot to assign
        </Text>
      </XStack>
      <Button
        size="$2"
        variant="outlined"
        theme="blue"
        onPress={onClear}
        aria-label="Clear selection"
      >
        Cancel
      </Button>
    </XStack>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export interface LeagueRosterManagementProps {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSwap: (
    incomingPlayer: TeamMemberFragment,
    targetPosition: LeaguePositionFragment,
    displacedPlayer: TeamMemberFragment,
  ) => void;
  loading?: boolean;
  playerMatchupData?: ReadonlyMap<number, PlayerMatchupData>;
  /** When true, the roster is displayed in read-only mode (viewing another team) */
  readOnly?: boolean;
  /** Team name to display in the header (defaults to "My Roster") */
  teamName?: string;
}

export function LeagueRosterManagement({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSwap,
  loading = false,
  playerMatchupData,
  readOnly = false,
  teamName,
}: LeagueRosterManagementProps): React.JSX.Element {
  const [selectedPlayer, setSelectedPlayer] =
    useState<TeamMemberFragment | null>(null);

  // ── Recently-moved flash tracking ────────────────────────────────────────

  const [recentlyMovedIds, setRecentlyMovedIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ensureFlashStyle();
  }, []);

  const flashIds = useCallback((...ids: (number | null | undefined)[]) => {
    const validIds = ids.filter((id): id is number => id != null);
    if (validIds.length === 0) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setRecentlyMovedIds(new Set(validIds));
    flashTimerRef.current = setTimeout(() => {
      setRecentlyMovedIds(new Set());
    }, FLASH_DURATION_MS);
  }, []);

  // ── Split positions into groups ──────────────────────────────────────────

  const groupedPositions = useMemo(() => {
    const pitching = positions.filter((p) =>
      pitchingPositions.has(p.positionType ?? ''),
    );
    const infield = positions.filter((p) =>
      infieldPositions.has(p.positionType ?? ''),
    );
    const outfield = positions.filter((p) =>
      outfieldPositions.has(p.positionType ?? ''),
    );
    const utility = positions.filter((p) =>
      utilityPositions.has(p.positionType ?? ''),
    );
    return { pitching, infield, outfield, utility };
  }, [positions]);

  // ── Split bench into pitchers vs fielders ────────────────────────────────

  const benchPlayers = useMemo(
    () => teamPlayers.filter((p) => !p.positionId),
    [teamPlayers],
  );

  const bullpenPlayers = useMemo(
    () => benchPlayers.filter((p) => isPlayerPitcher(p) && !isPlayerBatter(p)),
    [benchPlayers],
  );

  const benchFielders = useMemo(
    () => benchPlayers.filter((p) => isPlayerBatter(p) && !isPlayerPitcher(p)),
    [benchPlayers],
  );

  const dualEligiblePlayers = useMemo(
    () => benchPlayers.filter((p) => isDualEligible(p)),
    [benchPlayers],
  );

  const unclassifiedPlayers = useMemo(
    () => benchPlayers.filter((p) => getEligiblePositions(p).length === 0),
    [benchPlayers],
  );

  // ── Lookup helpers ───────────────────────────────────────────────────────

  const getAssignedPlayer = useCallback(
    (position: LeaguePositionFragment) =>
      teamPlayers.find((player) => player.positionId === position.id),
    [teamPlayers],
  );

  const handlePlayerAssign = useCallback(
    (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (readOnly) return;
      onPlayerAssign(player, position);
      setSelectedPlayer(null);
      flashIds(player.id, position.id);
    },
    [readOnly, onPlayerAssign, flashIds],
  );

  const handlePlayerSwap = useCallback(
    (
      incomingPlayer: TeamMemberFragment,
      targetPosition: LeaguePositionFragment,
      displacedPlayer: TeamMemberFragment,
    ) => {
      if (readOnly) return;
      onPlayerSwap(incomingPlayer, targetPosition, displacedPlayer);
      setSelectedPlayer(null);
      flashIds(incomingPlayer.id, displacedPlayer.id, targetPosition.id);
    },
    [readOnly, onPlayerSwap, flashIds],
  );

  const handleBenchPlayer = useCallback(
    (player: TeamMemberFragment) => {
      if (readOnly) return;
      const pos = positions.find((p) => p.id === player.positionId);
      if (pos) {
        onPlayerRemove(pos);
        setSelectedPlayer(null);
        flashIds(player.id);
      }
    },
    [readOnly, positions, onPlayerRemove, flashIds],
  );

  // ── Computed stats ───────────────────────────────────────────────────────

  const filledCount = positions.filter((p) =>
    Boolean(getAssignedPlayer(p)),
  ).length;
  const emptyCount = positions.length - filledCount;
  const totalBench =
    benchFielders.length +
    dualEligiblePlayers.length +
    unclassifiedPlayers.length;
  const totalBullpen = bullpenPlayers.length + dualEligiblePlayers.length;

  // In read-only mode, use a no-op for player selection
  const noopPlayerSelect = useCallback((_player: TeamMemberFragment | null) => {
    /* read-only: interactions disabled */
  }, []);
  const handlePlayerSelect = readOnly ? noopPlayerSelect : setSelectedPlayer;

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <YStack
        padding="$6"
        alignItems="center"
        gap="$3"
        role="status"
        aria-live="polite"
      >
        <Text fontSize="$5" fontWeight="600" color="$textMuted">
          Loading roster...
        </Text>
      </YStack>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <YStack
      width="100%"
      role="region"
      aria-label={
        readOnly ? `${teamName ?? 'Team'} roster` : 'Roster management'
      }
    >
      <YStack gap="$4" width="100%" maxWidth={1280} alignSelf="center">
        {/* ── Header with glass effect ─────────────────────────────── */}
        <GlassHeader>
          <YStack gap="$1">
            <H4 margin={0}>{teamName ?? 'My Roster'}</H4>
            <Text fontSize="$2" color="$textMuted">
              {readOnly
                ? 'Viewing this team\u2019s roster (read-only)'
                : selectedPlayer
                  ? 'Tap a lineup slot to assign the selected player'
                  : 'Tap lineup players or bench players to manage your roster'}
            </Text>
          </YStack>
          <XStack gap="$2" flexWrap="wrap">
            <QuickStat
              label="Lineup"
              value={`${filledCount}/${positions.length}`}
            />
            <QuickStat label="Bench" value={totalBench} />
            <QuickStat label="Bullpen" value={totalBullpen} />
            <QuickStat
              label="Open"
              value={emptyCount}
              tone={emptyCount === 0 ? 'positive' : 'warning'}
            />
          </XStack>
        </GlassHeader>

        {/* ── Selected player banner ──────────────────────────────── */}
        {selectedPlayer && !readOnly && (
          <YStack paddingHorizontal="$3">
            <SelectedBanner
              player={selectedPlayer}
              onClear={() => handlePlayerSelect(null)}
            />
          </YStack>
        )}

        {/* ── Main content: lineup table + bench sidebar ─────────── */}
        <XStack
          gap="$4"
          paddingHorizontal="$3"
          flexDirection="column"
          $gtMd={{ flexDirection: 'row' }}
          alignItems="flex-start"
        >
          {/* ── Lineup Table ──────────────────────────────────────── */}
          <YStack flex={3} minWidth={0}>
            <YStack
              backgroundColor="rgba(17, 27, 47, 0.85)"
              borderColor="#1F2D48"
              borderWidth={1}
              borderRadius="$5"
              overflow="hidden"
              style={{
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              {/* Gradient accent bar */}
              <YStack
                height={3}
                width="100%"
                style={{
                  background:
                    'linear-gradient(90deg, #3B82F6, #8B5CF6, #EC4899)',
                }}
              />
              {/* Column headers */}
              <TableHeaderRow
                backgroundColor="#0D1526"
                borderBottomWidth={1}
                borderBottomColor="#1C2740"
              >
                <Text
                  width={56}
                  fontSize="$1"
                  fontWeight="700"
                  color="#F5F7FA"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                >
                  Pos
                </Text>
                <Text
                  flex={1}
                  fontSize="$1"
                  fontWeight="700"
                  color="#F5F7FA"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                >
                  Player
                </Text>
                <Text
                  width={50}
                  fontSize="$1"
                  fontWeight="700"
                  color="#F5F7FA"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="center"
                >
                  Score
                </Text>
                <Text
                  width={50}
                  fontSize="$1"
                  fontWeight="700"
                  color="#93C5FD"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="center"
                >
                  Proj
                </Text>
                <Text
                  width={60}
                  fontSize="$1"
                  fontWeight="700"
                  color="#F5F7FA"
                  textTransform="uppercase"
                  letterSpacing={0.6}
                  textAlign="right"
                >
                  Status
                </Text>
              </TableHeaderRow>

              {/* Roster sections */}
              <RosterSection
                title="Pitching"
                positions={groupedPositions.pitching}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={readOnly ? null : selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerSwap={handlePlayerSwap}
                onPlayerSelect={handlePlayerSelect}
                recentlyMovedIds={recentlyMovedIds}
                playerMatchupData={playerMatchupData}
              />

              <RosterSection
                title="Infield"
                positions={groupedPositions.infield}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={readOnly ? null : selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerSwap={handlePlayerSwap}
                onPlayerSelect={handlePlayerSelect}
                recentlyMovedIds={recentlyMovedIds}
                playerMatchupData={playerMatchupData}
              />

              <RosterSection
                title="Outfield"
                positions={groupedPositions.outfield}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={readOnly ? null : selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerSwap={handlePlayerSwap}
                onPlayerSelect={handlePlayerSelect}
                recentlyMovedIds={recentlyMovedIds}
                playerMatchupData={playerMatchupData}
              />

              <RosterSection
                title="Utility"
                positions={groupedPositions.utility}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={readOnly ? null : selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerSwap={handlePlayerSwap}
                onPlayerSelect={handlePlayerSelect}
                recentlyMovedIds={recentlyMovedIds}
                playerMatchupData={playerMatchupData}
              />
            </YStack>
          </YStack>

          {/* ── Bench & Bullpen Sidebar ───────────────────────────── */}
          <YStack
            flex={2}
            minWidth={260}
            maxWidth={420}
            gap="$4"
            width="100%"
            $gtMd={{ width: 'auto' }}
          >
            <BenchPanel
              players={[...bullpenPlayers, ...dualEligiblePlayers]}
              selectedPlayer={readOnly ? null : selectedPlayer}
              onPlayerSelect={handlePlayerSelect}
              title="Bullpen"
              titleId="bullpen-title"
              emptyLabel="Bullpen is empty"
              emptyHint={
                readOnly
                  ? 'No pitchers on the bullpen.'
                  : 'Add pitchers or move them from the rotation.'
              }
              accentColor="$blue9"
              recentlyMovedIds={recentlyMovedIds}
              playerMatchupData={playerMatchupData}
            />

            <BenchPanel
              players={[
                ...benchFielders,
                ...dualEligiblePlayers,
                ...unclassifiedPlayers,
              ]}
              selectedPlayer={readOnly ? null : selectedPlayer}
              onPlayerSelect={handlePlayerSelect}
              onBench={readOnly ? undefined : handleBenchPlayer}
              title="Bench"
              titleId="bench-title"
              emptyLabel="Bench is empty"
              emptyHint={
                readOnly
                  ? 'No players on the bench.'
                  : 'Add free agents or move players from the lineup.'
              }
              accentColor="$green9"
              recentlyMovedIds={recentlyMovedIds}
              playerMatchupData={playerMatchupData}
            />
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  );
}
