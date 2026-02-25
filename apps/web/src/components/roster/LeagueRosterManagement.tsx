import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  getPlayerName,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { PITCHING_POSITIONS } from '@legacy-sports/shared-components';
import { H4, H5, Text } from 'tamagui';
import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';
import {
  AMBER,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  GREEN,
  RED,
  withAlpha,
} from '../../constants/colors';

const pitchingPositions = PITCHING_POSITIONS;
const infieldPositions = new Set(['C', '1B', '2B', '3B', 'SS']);
const outfieldPositions = new Set(['LF', 'CF', 'RF', 'OF']);
const utilityPositions = new Set(['IF', 'XDH', 'DH']);

const canPlayerPlayPosition = (
  player: TeamMemberFragment,
  position: LeaguePositionFragment,
): boolean => {
  // Placeholder until player eligibility is surfaced via the API schema.
  return Boolean(player) && Boolean(position);
};

/** Full display names for the web UI (e.g. "Starting Pitcher") */
const getPositionDisplayName = (positionType: string): string => {
  const displayNames: Record<string, string> = {
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

  return displayNames[positionType] || positionType;
};

type PositionAccent = {
  badgeBg: string;
  badgeColor: string;
  borderColor: string;
  emptyBorderColor: string;
  backgroundFilled: string;
  backgroundEmpty: string;
  selectedBackground: string;
};

const getPositionAccent = (positionType: string): PositionAccent => {
  const baseAccent: PositionAccent = {
    badgeBg: '$surfaceInteractive',
    badgeColor: '$textOnAccent',
    borderColor: '$outlineStrong',
    emptyBorderColor: '$outlineSubtle',
    backgroundFilled: '$surfaceCard',
    backgroundEmpty: '$surfaceSubtle',
    selectedBackground: '$accentMuted',
  };

  if (pitchingPositions.has(positionType)) {
    return {
      ...baseAccent,
      badgeBg: withAlpha(BRAND_NAVY_LIGHT, 0.22),
      badgeColor: BRAND_GOLD_LIGHT,
      borderColor: BRAND_NAVY_LIGHT,
    };
  }

  if (infieldPositions.has(positionType)) {
    return {
      ...baseAccent,
      badgeBg: withAlpha(RED, 0.16),
      badgeColor: '$sportBaseballSecondary',
      borderColor: '$red6',
    };
  }

  if (outfieldPositions.has(positionType)) {
    return {
      ...baseAccent,
      badgeBg: withAlpha(GREEN, 0.16),
      badgeColor: '$green9',
      borderColor: '$green7',
    };
  }

  if (utilityPositions.has(positionType)) {
    return {
      ...baseAccent,
      badgeBg: withAlpha(AMBER, 0.18),
      badgeColor: '$amber8',
      borderColor: '$amber7',
    };
  }

  return baseAccent;
};

type SummaryTone = 'default' | 'positive' | 'warning';

interface SummaryStatProps {
  label: string;
  value: string;
  description?: string;
  tone?: SummaryTone;
}

const SummaryStat = ({
  label,
  value,
  description,
  tone = 'default',
}: SummaryStatProps): React.JSX.Element => {
  const backgroundColor =
    tone === 'positive'
      ? '$successMuted'
      : tone === 'warning'
        ? '$warningMuted'
        : '$surfaceSubtle';

  const borderColor =
    tone === 'positive'
      ? '$green7'
      : tone === 'warning'
        ? '$amber7'
        : '$outlineSubtle';

  const valueColor =
    tone === 'positive'
      ? '$green8'
      : tone === 'warning'
        ? '$amber8'
        : '$color12';

  return (
    <YStack
      padding="$3"
      borderRadius="$5"
      borderWidth={1}
      backgroundColor={backgroundColor}
      borderColor={borderColor}
      minWidth={140}
      space="$2"
    >
      <Text
        fontSize="$2"
        fontWeight="600"
        color="$textMuted"
        textTransform="uppercase"
        letterSpacing={1}
      >
        {label}
      </Text>
      <Text fontSize="$5" fontWeight="700" color={valueColor}>
        {value}
      </Text>
      {description && (
        <Text fontSize="$2" color="$textMuted">
          {description}
        </Text>
      )}
    </YStack>
  );
};

interface RosterSlotProps {
  position: LeaguePositionFragment;
  assignedPlayer?: TeamMemberFragment | null;
  selectedPlayer: TeamMemberFragment | null;
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
  isSelected?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function RosterSlot({
  position,
  assignedPlayer,
  selectedPlayer,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSelect,
  isSelected = false,
  isFirst = false,
  isLast = false,
}: RosterSlotProps): React.JSX.Element {
  const accents = useMemo(
    () => getPositionAccent(position.positionType || ''),
    [position.positionType],
  );

  const hasPlayer = Boolean(assignedPlayer);
  const canAcceptSelectedPlayer = Boolean(
    selectedPlayer &&
    selectedPlayer.id &&
    canPlayerPlayPosition(selectedPlayer, position),
  );

  const handleSlotPress = useCallback(() => {
    if (hasPlayer && assignedPlayer) {
      onPlayerSelect(assignedPlayer);
    } else if (selectedPlayer && canAcceptSelectedPlayer) {
      onPlayerAssign(selectedPlayer, position);
      onPlayerSelect(null);
    }
  }, [
    hasPlayer,
    assignedPlayer,
    selectedPlayer,
    canAcceptSelectedPlayer,
    onPlayerAssign,
    onPlayerSelect,
    position,
  ]);

  const handleRemovePlayer = useCallback(() => {
    if (hasPlayer) {
      onPlayerRemove(position);
    }
  }, [hasPlayer, onPlayerRemove, position]);

  const positionLabel = getPositionDisplayName(position.positionType || '');
  const badgeLabel = position.positionType || 'Slot';

  const cardBackground = isSelected
    ? accents.selectedBackground
    : hasPlayer
      ? accents.backgroundFilled
      : canAcceptSelectedPlayer
        ? '$successMuted'
        : accents.backgroundEmpty;

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSlotPress();
    }
  };

  return (
    <Card
      paddingVertical="$3"
      paddingHorizontal="$3"
      borderRadius={0}
      borderTopLeftRadius={isFirst ? '$5' : 0}
      borderTopRightRadius={isFirst ? '$5' : 0}
      borderBottomLeftRadius={isLast ? '$5' : 0}
      borderBottomRightRadius={isLast ? '$5' : 0}
      borderWidth={0}
      backgroundColor={cardBackground}
      hoverStyle={{
        backgroundColor: isSelected
          ? accents.selectedBackground
          : '$surfaceSubtle',
      }}
      pressStyle={{
        scale: 0.995,
      }}
      cursor="pointer"
      width="100%"
      onPress={handleSlotPress}
      role="button"
      tabIndex={0}
      aria-pressed={Boolean(isSelected)}
      aria-label={
        hasPlayer
          ? `${getPlayerName(assignedPlayer)} is assigned to ${badgeLabel}. Activate to select or move them.`
          : canAcceptSelectedPlayer && selectedPlayer
            ? `Assign ${getPlayerName(selectedPlayer)} to ${badgeLabel}`
            : `${badgeLabel} is open. Select a bench player to assign.`
      }
      onKeyDown={onKeyDown}
      minHeight={68}
    >
      <XStack alignItems="center" gap="$3" flexWrap="wrap">
        <XStack alignItems="center" gap="$3" flex={1} minWidth={0}>
          <YStack
            width={44}
            height={44}
            borderRadius="$5"
            backgroundColor={accents.badgeBg}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="$2" fontWeight="700" color={accents.badgeColor}>
              {badgeLabel}
            </Text>
          </YStack>
          <YStack flex={1} minWidth={0} space="$1">
            <Text
              fontSize="$3"
              fontWeight="700"
              color="$color12"
              numberOfLines={1}
            >
              {hasPlayer ? getPlayerName(assignedPlayer) : positionLabel}
            </Text>
            <Text fontSize="$2" color="$textMuted" numberOfLines={1}>
              {hasPlayer
                ? `Team Member ID: ${assignedPlayer?.id ?? '—'}`
                : 'Select a bench player to fill this spot.'}
            </Text>
            {selectedPlayer && !canAcceptSelectedPlayer && !hasPlayer && (
              <Text fontSize="$1" color="$textMuted" fontStyle="italic">
                {getPlayerName(selectedPlayer)} is not eligible for this slot.
              </Text>
            )}
          </YStack>
        </XStack>
        <XStack alignItems="center" gap="$2">
          <Text
            fontSize="$2"
            fontWeight="600"
            color={
              hasPlayer
                ? '$green8'
                : canAcceptSelectedPlayer
                  ? '$green8'
                  : '$textMuted'
            }
          >
            {hasPlayer
              ? 'Locked In'
              : canAcceptSelectedPlayer
                ? 'Ready to Assign'
                : 'Open Slot'}
          </Text>
          {hasPlayer && (
            <Button
              size="$2"
              variant="outlined"
              theme="red"
              onPress={handleRemovePlayer}
              aria-label={`Move ${getPlayerName(assignedPlayer)} to the bench`}
            >
              Move
            </Button>
          )}
        </XStack>
      </XStack>
    </Card>
  );
}

interface RosterSectionProps {
  title: string;
  subtitle?: string;
  positions: readonly LeaguePositionFragment[];
  getAssignedPlayer: (
    position: LeaguePositionFragment,
  ) => TeamMemberFragment | undefined;
  selectedPlayer: TeamMemberFragment | null;
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
}

const RosterSection = ({
  title,
  subtitle,
  positions,
  getAssignedPlayer,
  selectedPlayer,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSelect,
}: RosterSectionProps): React.JSX.Element | null => {
  if (!positions.length) {
    return null;
  }

  const filledCount = positions.filter((position) =>
    Boolean(getAssignedPlayer(position)),
  ).length;

  return (
    <Card
      padding="$4"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      aria-label={`${title} section`}
    >
      <YStack space="$3">
        <XStack
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap="$3"
        >
          <YStack space="$1">
            <H5>{title}</H5>
            {subtitle && (
              <Text fontSize="$3" color="$textMuted">
                {subtitle}
              </Text>
            )}
          </YStack>
          <Text fontSize="$3" color="$textMuted">
            {filledCount} / {positions.length} filled
          </Text>
        </XStack>
        <Separator borderColor="$outlineSubtle" marginVertical="$2" />
        <YStack
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          borderRadius="$5"
          overflow="hidden"
        >
          {positions.map((position, index) => (
            <React.Fragment key={position.id}>
              <RosterSlot
                position={position}
                assignedPlayer={getAssignedPlayer(position)}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={onPlayerAssign}
                onPlayerRemove={onPlayerRemove}
                onPlayerSelect={onPlayerSelect}
                isSelected={
                  getAssignedPlayer(position)?.id === selectedPlayer?.id
                }
                isFirst={index === 0}
                isLast={index === positions.length - 1}
              />
              {index < positions.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginVertical={0} />
              )}
            </React.Fragment>
          ))}
        </YStack>
      </YStack>
    </Card>
  );
};

interface BenchListProps {
  players: readonly TeamMemberFragment[];
  selectedPlayer: TeamMemberFragment | null;
  onPlayerSelect: (player: TeamMemberFragment | null) => void;
}

const BenchList = ({
  players,
  selectedPlayer,
  onPlayerSelect,
}: BenchListProps): React.JSX.Element => (
  <Card
    padding="$4"
    backgroundColor="$surfacePanel"
    borderColor="$surfacePanelBorder"
    borderWidth={1}
    borderRadius="$6"
    role="region"
    aria-labelledby="bench-title"
  >
    <YStack space="$3">
      <XStack justifyContent="space-between" alignItems="center">
        <H5 id="bench-title">Bench</H5>
        <Text fontSize="$3" color="$textMuted">
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </Text>
      </XStack>
      <Text fontSize="$3" color="$textMuted">
        Select a bench player, then tap an open slot to assign them.
      </Text>
      {players.length === 0 ? (
        <YStack
          paddingVertical="$6"
          alignItems="center"
          space="$2"
          role="status"
        >
          <Text fontSize="$4" fontWeight="600" color="$textMuted">
            Bench is empty
          </Text>
          <Text fontSize="$2" color="$textMuted">
            Add free agents or move players from the lineup.
          </Text>
        </YStack>
      ) : (
        <YStack space="$2">
          {players.map((player) => {
            const isActive = selectedPlayer?.id === player.id;

            const handleSelect = () => onPlayerSelect(isActive ? null : player);

            const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (
              event,
            ) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSelect();
              }
            };

            return (
              <Card
                key={player.id}
                padding="$3"
                borderRadius="$5"
                borderWidth={1}
                borderColor={
                  isActive ? BRAND_NAVY_LIGHT : '$surfacePanelBorder'
                }
                backgroundColor={isActive ? '$accentMuted' : '$surfaceSubtle'}
                hoverStyle={{
                  borderColor: BRAND_NAVY_LIGHT,
                  scale: 0.995,
                }}
                pressStyle={{
                  scale: 0.985,
                }}
                cursor="pointer"
                role="button"
                aria-pressed={isActive}
                tabIndex={0}
                onPress={handleSelect}
                onKeyDown={handleKeyDown}
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <YStack>
                    <Text fontSize="$4" fontWeight="600" color="$color12">
                      {getPlayerName(player)}
                    </Text>
                    <Text fontSize="$2" color="$textMuted">
                      Team Member ID: {player.id}
                    </Text>
                  </YStack>
                  <Text
                    fontSize="$2"
                    color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
                    fontWeight={isActive ? '600' : '500'}
                  >
                    {isActive ? 'Selected' : 'Tap to select'}
                  </Text>
                </XStack>
              </Card>
            );
          })}
        </YStack>
      )}
    </YStack>
  </Card>
);

export interface LeagueRosterManagementProps {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  loading?: boolean;
}

export function LeagueRosterManagement({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  loading = false,
}: LeagueRosterManagementProps): React.JSX.Element {
  const [selectedPlayer, setSelectedPlayer] =
    useState<TeamMemberFragment | null>(null);

  const groupedPositions = useMemo(() => {
    const pitching = positions.filter((position) =>
      pitchingPositions.has(position.positionType ?? ''),
    );
    const utility = positions.filter((position) =>
      utilityPositions.has(position.positionType ?? ''),
    );
    const batting = positions.filter(
      (position) =>
        !pitchingPositions.has(position.positionType ?? '') &&
        !utilityPositions.has(position.positionType ?? ''),
    );

    return {
      pitching,
      batting,
      utility,
    };
  }, [positions]);

  const benchPlayers = useMemo(
    () => teamPlayers.filter((player) => !player.positionId),
    [teamPlayers],
  );

  const getAssignedPlayer = useCallback(
    (position: LeaguePositionFragment) =>
      teamPlayers.find((player) => player.positionId === position.id),
    [teamPlayers],
  );

  const handlePlayerAssign = useCallback(
    (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      onPlayerAssign(player, position);
      setSelectedPlayer(null);
    },
    [onPlayerAssign],
  );

  const handlePlayerRemove = useCallback(
    (position: LeaguePositionFragment) => {
      onPlayerRemove(position);
    },
    [onPlayerRemove],
  );

  if (loading) {
    return (
      <YStack padding="$4" alignItems="center" role="status" aria-live="polite">
        <Text fontSize="$4" color="$textMuted">
          Loading roster...
        </Text>
      </YStack>
    );
  }

  const filledCount = positions.filter((position) =>
    Boolean(getAssignedPlayer(position)),
  ).length;
  const emptyCount = positions.length - filledCount;

  return (
    <YStack width="100%" role="region" aria-label="Roster management">
      <YStack padding="$5" space="$5" alignItems="center">
        <YStack space="$5" width="100%" maxWidth={1280}>
          <Card
            padding="$5"
            backgroundColor="$surfacePanel"
            borderColor="$surfacePanelBorder"
            borderWidth={1}
            borderRadius="$6"
            aria-labelledby="roster-management-title"
          >
            <YStack space="$4">
              <XStack
                justifyContent="space-between"
                alignItems="flex-start"
                flexWrap="wrap"
                gap="$3"
              >
                <YStack space="$2">
                  <H4 id="roster-management-title">Roster Management</H4>
                  <Text fontSize="$3" color="$textMuted">
                    Build a winning lineup and keep your bench ready for late
                    inning moves.
                  </Text>
                </YStack>
                <XStack gap="$3" flexWrap="wrap" justifyContent="flex-end">
                  <SummaryStat
                    label="Starting Slots"
                    value={`${filledCount} / ${positions.length}`}
                    description="Players locked into the lineup"
                  />
                  <SummaryStat
                    label="Bench"
                    value={`${benchPlayers.length}`}
                    description="Waiting for assignment"
                  />
                  <SummaryStat
                    label="Open Slots"
                    value={`${emptyCount}`}
                    tone={emptyCount === 0 ? 'positive' : 'warning'}
                    description={
                      emptyCount === 0
                        ? 'All positions filled'
                        : 'Fill before first pitch'
                    }
                  />
                </XStack>
              </XStack>
              {selectedPlayer ? (
                <Card
                  padding="$3"
                  borderRadius="$5"
                  borderWidth={1}
                  backgroundColor="$accentMuted"
                  borderColor={BRAND_NAVY_LIGHT}
                  alignSelf="flex-start"
                >
                  <XStack alignItems="center" gap="$3" flexWrap="wrap">
                    <YStack space="$1">
                      <Text
                        fontSize="$2"
                        fontWeight="600"
                        color="$textOnAccent"
                        textTransform="uppercase"
                        letterSpacing={0.5}
                      >
                        Selected Player
                      </Text>
                      <Text
                        fontSize="$4"
                        fontWeight="700"
                        color="$textOnAccent"
                      >
                        {getPlayerName(selectedPlayer)}
                      </Text>
                    </YStack>
                    <Button
                      size="$3"
                      variant="outlined"
                      theme="blue"
                      onPress={() => setSelectedPlayer(null)}
                    >
                      Clear Selection
                    </Button>
                  </XStack>
                </Card>
              ) : (
                <Text fontSize="$3" color="$textMuted">
                  Tap a bench player to select them, then choose a lineup slot
                  to assign.
                </Text>
              )}
            </YStack>
          </Card>

          <XStack flexWrap="wrap" gap="$5" alignItems="stretch">
            <YStack flex={3} minWidth={320} space="$4">
              <RosterSection
                title="Pitching Staff"
                subtitle="Starters & relievers"
                positions={groupedPositions.pitching}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerRemove={handlePlayerRemove}
                onPlayerSelect={setSelectedPlayer}
              />
              <RosterSection
                title="Position Players"
                subtitle="Infield and outfield"
                positions={groupedPositions.batting}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerRemove={handlePlayerRemove}
                onPlayerSelect={setSelectedPlayer}
              />
              <RosterSection
                title="Flex & Utility"
                subtitle="Move hitters where you need them"
                positions={groupedPositions.utility}
                getAssignedPlayer={getAssignedPlayer}
                selectedPlayer={selectedPlayer}
                onPlayerAssign={handlePlayerAssign}
                onPlayerRemove={handlePlayerRemove}
                onPlayerSelect={setSelectedPlayer}
              />
            </YStack>
            <YStack flex={2} minWidth={280} maxWidth={420} space="$4">
              <BenchList
                players={benchPlayers}
                selectedPlayer={selectedPlayer}
                onPlayerSelect={setSelectedPlayer}
              />
            </YStack>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
