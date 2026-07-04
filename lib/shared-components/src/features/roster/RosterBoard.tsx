import React, { useCallback, useMemo, useState } from 'react';
import { Card, H2, Spinner, Text, XStack, YStack } from 'tamagui';
import { ChevronRight, Users } from '@tamagui/lucide-icons';
import {
  canPlayerPlayPosition,
  getPositionLabel,
  isPitcherSlot,
  playerHasBatting,
  playerHasPitchingOnly,
} from './rosterEligibility';
import { getPositionColors } from './rosterUtils';
import { getPlayerName } from '../../utils/playerFormatting';

// ── Platform-agnostic shapes ────────────────────────────────────────────────
// Minimal structural types satisfied by both web and native `TeamMemberFragment`
// / `LeaguePositionFragment`. RosterBoard is generic over the caller's concrete
// fragment types so assign/swap callbacks keep their precise types at call sites.

export interface RosterBoardPosition {
  id?: number | null;
  positionType?: string | null;
}

export interface RosterBoardPlayer {
  id?: number | null;
  positionId?: number | null;
  nickname?: string | null;
  player?: {
    id?: number | null;
    firstName?: string | null;
    lastName?: string | null;
    eligiblePositions?: readonly string[] | null;
  } | null;
}

type SlotState = 'idle' | 'selected' | 'eligible-empty' | 'eligible-swap';

export interface RosterBoardProps<
  P extends RosterBoardPlayer,
  Pos extends RosterBoardPosition,
> {
  positions: readonly Pos[];
  teamPlayers: readonly P[];
  onPlayerAssign: (player: P, position: Pos) => void;
  onPlayerRemove: (position: Pos) => void;
  /**
   * Swap two players' slots. Optional: when omitted, tapping an occupied
   * eligible slot simply re-selects the occupant instead of swapping (used by
   * platforms whose data layer has no atomic swap mutation).
   */
  onPlayerSwap?: (incoming: P, target: Pos, displaced: P) => void;
  /**
   * Called when the user taps the chevron next to a player's name to view their
   * detail page. The caller is responsible for sport-aware navigation (e.g.
   * `/football/players/:id` vs `/players/:id`). When omitted, no chevron is shown.
   */
  onPlayerPress?: (player: P) => void;
  loading?: boolean;
  error?: Error | null;
  readOnly?: boolean;
  /** Position IDs whose slots are blocked while a mutation is in-flight. */
  disabledPositionIds?: ReadonlySet<number>;
}

// ── Row primitives ──────────────────────────────────────────────────────────

interface SlotRowProps {
  positionType: string;
  assignedName: string | null;
  assignedEligible: readonly string[];
  selectedName: string | null;
  state: SlotState;
  readOnly: boolean;
  disabled?: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
}

function SlotRow({
  positionType,
  assignedName,
  assignedEligible,
  selectedName,
  state,
  readOnly,
  disabled = false,
  onPress,
  onPlayerPress,
}: SlotRowProps): React.JSX.Element {
  const posType = positionType.toUpperCase();
  const badge = getPositionColors(posType);

  const background =
    state === 'selected'
      ? '$blue3'
      : state === 'eligible-swap'
        ? '$blue2'
        : state === 'eligible-empty'
          ? '$green2'
          : undefined;

  const ariaLabel = assignedName
    ? state === 'eligible-swap' && selectedName
      ? `Swap ${selectedName} into ${posType}`
      : `${assignedName} at ${posType}`
    : state === 'eligible-empty' && selectedName
      ? `Assign ${selectedName} to ${posType}`
      : `${getPositionLabel(posType)} — open slot`;

  const subText = assignedName
    ? assignedEligible.join(' · ')
    : state === 'eligible-empty' && selectedName
      ? `Tap to assign ${selectedName}`
      : 'Open slot';

  const isBlocked = readOnly || disabled;

  return (
    <XStack
      role="button"
      aria-pressed={state === 'selected'}
      aria-disabled={isBlocked}
      aria-label={ariaLabel}
      tabIndex={isBlocked ? -1 : 0}
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      borderRadius="$3"
      borderWidth={state === 'selected' ? 2 : 0}
      borderColor={state === 'selected' ? '$blue8' : undefined}
      backgroundColor={disabled ? '$gray2' : background}
      alignItems="center"
      gap="$2"
      opacity={disabled ? 0.6 : 1}
      hoverStyle={isBlocked ? undefined : { backgroundColor: '$gray3' }}
      pressStyle={isBlocked ? undefined : { scale: 0.99 }}
      animation="quick"
      onPress={isBlocked ? undefined : onPress}
    >
      <YStack
        width={36}
        height={36}
        borderRadius={18}
        backgroundColor={badge.bg}
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
      >
        {disabled ? (
          <Spinner size="small" color={badge.text} />
        ) : (
          <Text fontSize="$2" fontWeight="800" color={badge.text}>
            {posType}
          </Text>
        )}
      </YStack>
      <YStack flex={1} minWidth={0}>
        <Text fontSize="$3" fontWeight="600" color="$gray12" numberOfLines={1}>
          {assignedName ?? getPositionLabel(posType)}
        </Text>
        <Text fontSize="$1" color="$gray10" numberOfLines={1}>
          {subText}
        </Text>
      </YStack>
      {assignedName && onPlayerPress && (
        <YStack
          role="button"
          aria-label={`View ${assignedName} detail`}
          padding="$1"
          onPress={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onPlayerPress();
          }}
        >
          <ChevronRight size={16} color="var(--gray9)" />
        </YStack>
      )}
    </XStack>
  );
}

interface BenchRowProps {
  name: string;
  eligible: readonly string[];
  primaryPosition: string;
  selected: boolean;
  readOnly: boolean;
  onPress: () => void;
  onPlayerPress?: () => void;
}

function BenchRow({
  name,
  eligible,
  primaryPosition,
  selected,
  readOnly,
  onPress,
  onPlayerPress,
}: BenchRowProps): React.JSX.Element {
  const badge = getPositionColors(primaryPosition);
  return (
    <XStack
      role="button"
      aria-pressed={selected}
      aria-disabled={readOnly}
      aria-label={`${name} — bench${selected ? ', selected' : ''}`}
      tabIndex={readOnly ? -1 : 0}
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      borderRadius="$3"
      borderWidth={selected ? 2 : 0}
      borderColor={selected ? '$blue8' : undefined}
      backgroundColor={selected ? '$blue3' : undefined}
      alignItems="center"
      gap="$2"
      hoverStyle={readOnly ? undefined : { backgroundColor: '$gray3' }}
      pressStyle={readOnly ? undefined : { scale: 0.99 }}
      animation="quick"
      onPress={readOnly ? undefined : onPress}
    >
      <YStack
        width={36}
        height={36}
        borderRadius={18}
        backgroundColor={badge.bg}
        justifyContent="center"
        alignItems="center"
        flexShrink={0}
      >
        <Text fontSize="$2" fontWeight="800" color={badge.text}>
          BN
        </Text>
      </YStack>
      <YStack flex={1} minWidth={0}>
        <Text fontSize="$3" fontWeight="600" color="$gray12" numberOfLines={1}>
          {name}
        </Text>
        <Text fontSize="$1" color="$gray10" numberOfLines={1}>
          {eligible.length > 0 ? eligible.join(' · ') : 'Unclassified'}
        </Text>
      </YStack>
      {onPlayerPress && (
        <YStack
          role="button"
          aria-label={`View ${name} detail`}
          padding="$1"
          onPress={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onPlayerPress();
          }}
        >
          <ChevronRight size={16} color="var(--gray9)" />
        </YStack>
      )}
    </XStack>
  );
}

// ── Section card ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  right,
  children,
  testId,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}): React.JSX.Element {
  return (
    <Card
      borderRadius="$6"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$background"
      padding="$3"
      testID={testId}
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        {/* H2 keeps each section one level below the league page's h1 hero,
            matching the web a11y heading hierarchy (LS-4171). */}
        <H2 fontSize="$5" fontWeight="700" color="$color" margin={0}>
          {title}
        </H2>
        {right}
      </XStack>
      {children}
    </Card>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/**
 * RosterBoard — cross-platform lineup board extracted from the web canonical
 * `RosterBoardV2` (LS-7813). Selection-driven assign / swap / bench interaction:
 * tap a player to select, then tap an eligible slot to assign or swap, or tap
 * the bench to send them down. Pure presentation + local selection state; all
 * mutations are delegated to the caller. Renders on web and native via Tamagui.
 */
export function RosterBoard<
  P extends RosterBoardPlayer,
  Pos extends RosterBoardPosition,
>({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSwap,
  onPlayerPress,
  loading = false,
  error = null,
  readOnly = false,
  disabledPositionIds,
}: RosterBoardProps<P, Pos>): React.JSX.Element {
  const [selected, setSelected] = useState<P | null>(null);

  const { hitterSlots, pitcherSlots } = useMemo(() => {
    const hitters: Pos[] = [];
    const pitchers: Pos[] = [];
    for (const p of positions) {
      if (isPitcherSlot(p.positionType)) pitchers.push(p);
      else hitters.push(p);
    }
    return { hitterSlots: hitters, pitcherSlots: pitchers };
  }, [positions]);

  const benchPlayers = useMemo(
    () => teamPlayers.filter((p) => p.positionId == null),
    [teamPlayers],
  );

  const { benchHitters, benchPitchers } = useMemo(() => {
    const hitters: P[] = [];
    const pitchers: P[] = [];
    for (const p of benchPlayers) {
      if (playerHasPitchingOnly(p)) pitchers.push(p);
      else if (playerHasBatting(p)) hitters.push(p);
      else hitters.push(p); // unclassified → hitters group (safety fallback)
    }
    return { benchHitters: hitters, benchPitchers: pitchers };
  }, [benchPlayers]);

  const filledHitters = hitterSlots.filter((s) =>
    teamPlayers.some((tp) => tp.positionId === s.id),
  ).length;
  const filledPitchers = pitcherSlots.filter((s) =>
    teamPlayers.some((tp) => tp.positionId === s.id),
  ).length;

  const handleSlotPress = useCallback(
    (position: Pos) => {
      if (readOnly) return;
      if (position.id != null && disabledPositionIds?.has(position.id)) return;
      const assigned = teamPlayers.find((p) => p.positionId === position.id);
      if (!selected) {
        if (assigned) setSelected(assigned);
        return;
      }
      // Clicking the already-selected player's own slot → deselect.
      if (assigned && assigned.id === selected.id) {
        setSelected(null);
        return;
      }
      const canAccept = canPlayerPlayPosition(selected, position.positionType);
      if (assigned && canAccept) {
        // Swap when the data layer supports it; otherwise re-select occupant.
        if (onPlayerSwap) {
          onPlayerSwap(selected, position, assigned);
          setSelected(null);
        } else {
          setSelected(assigned);
        }
        return;
      }
      if (!assigned && canAccept) {
        onPlayerAssign(selected, position);
        setSelected(null);
        return;
      }
      // Selected player can't play here — switch to the occupant or deselect.
      if (assigned) setSelected(assigned);
      else setSelected(null);
    },
    [
      readOnly,
      selected,
      teamPlayers,
      onPlayerAssign,
      onPlayerSwap,
      disabledPositionIds,
    ],
  );

  const handleBenchSelect = useCallback(
    (player: P) => {
      if (readOnly) return;
      // Tapping the bench while a lineup player is selected → bench that player.
      if (selected && selected.positionId != null) {
        const pos = positions.find((p) => p.id === selected.positionId);
        if (pos) {
          onPlayerRemove(pos);
          setSelected(null);
          return;
        }
      }
      setSelected(selected?.id === player.id ? null : player);
    },
    [readOnly, selected, positions, onPlayerRemove],
  );

  if (loading) {
    return (
      <Card
        borderRadius="$6"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        padding="$5"
        alignItems="center"
      >
        <Spinner size="small" color="$blue8" />
        <Text marginTop="$2" color="$gray11" fontSize="$3">
          Loading roster…
        </Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        role="alert"
        borderRadius="$6"
        borderWidth={1}
        borderColor="$red7"
        backgroundColor="$red2"
        padding="$5"
        alignItems="center"
      >
        <Text fontSize="$4" fontWeight="700" color="$red11">
          Failed to load roster
        </Text>
        <Text marginTop="$1" color="$red11" fontSize="$2">
          Refresh the page to try again.
        </Text>
      </Card>
    );
  }

  const selectedName = selected ? getPlayerName(selected) : null;
  const moveToBenchEnabled = !readOnly && selected?.positionId != null;

  const renderSlot = (position: Pos) => {
    const assigned = teamPlayers.find((p) => p.positionId === position.id);
    let state: SlotState = 'idle';
    if (selected) {
      const canAccept = canPlayerPlayPosition(selected, position.positionType);
      if (assigned?.id === selected.id) state = 'selected';
      else if (assigned && canAccept) state = 'eligible-swap';
      else if (!assigned && canAccept) state = 'eligible-empty';
    }
    const slotDisabled =
      position.id != null && (disabledPositionIds?.has(position.id) ?? false);
    return (
      <SlotRow
        key={position.id}
        positionType={position.positionType ?? ''}
        assignedName={assigned ? getPlayerName(assigned) : null}
        assignedEligible={assigned?.player?.eligiblePositions ?? []}
        selectedName={selectedName}
        state={state}
        readOnly={readOnly}
        disabled={slotDisabled}
        onPress={() => handleSlotPress(position)}
        onPlayerPress={
          assigned && onPlayerPress ? () => onPlayerPress(assigned) : undefined
        }
      />
    );
  };

  return (
    <YStack gap="$4">
      {selected && !readOnly && (
        <Card
          role="status"
          aria-live="polite"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$blue7"
          backgroundColor="$blue2"
          padding="$3"
        >
          <XStack alignItems="center" gap="$2">
            <Users size={18} color="var(--blue11)" />
            <YStack flex={1} minWidth={0}>
              <Text fontSize="$3" fontWeight="700" color="$blue12">
                {selectedName} selected
              </Text>
              <Text fontSize="$2" color="$blue11">
                {selected.positionId != null
                  ? 'Tap an eligible slot to swap, or tap the bench to send this player there.'
                  : 'Tap an eligible lineup slot to assign.'}
              </Text>
            </YStack>
            <Text
              role="button"
              aria-label="Cancel selection"
              tabIndex={0}
              fontSize="$2"
              fontWeight="600"
              color="$blue11"
              hoverStyle={{ color: '$blue12' }}
              onPress={() => setSelected(null)}
            >
              Cancel
            </Text>
          </XStack>
        </Card>
      )}

      <SectionCard
        title="Starting Hitters"
        testId="roster-section-hitters"
        right={
          <Text fontSize="$2" color="$gray10">
            {filledHitters}/{hitterSlots.length}
          </Text>
        }
      >
        {hitterSlots.length === 0 ? (
          <Text color="$gray9" fontSize="$2" padding="$2">
            No hitter slots configured.
          </Text>
        ) : (
          <YStack gap="$2">{hitterSlots.map(renderSlot)}</YStack>
        )}
      </SectionCard>

      <SectionCard
        title="Starting Pitchers"
        testId="roster-section-pitchers"
        right={
          <Text fontSize="$2" color="$gray10">
            {filledPitchers}/{pitcherSlots.length}
          </Text>
        }
      >
        {pitcherSlots.length === 0 ? (
          <Text color="$gray9" fontSize="$2" padding="$2">
            No pitcher slots configured.
          </Text>
        ) : (
          <YStack gap="$2">{pitcherSlots.map(renderSlot)}</YStack>
        )}
      </SectionCard>

      <SectionCard
        title="Bench"
        testId="roster-section-bench"
        right={
          <Text fontSize="$2" color="$gray10">
            {benchPlayers.length} players
          </Text>
        }
      >
        {benchPlayers.length === 0 && !moveToBenchEnabled ? (
          <Text color="$gray9" fontSize="$2" padding="$2">
            Bench is empty. Add free agents or move players from the lineup.
          </Text>
        ) : (
          <YStack gap="$4">
            <YStack gap="$2">
              <Text fontSize="$2" color="$gray10">
                Hitters · {benchHitters.length}
              </Text>
              {benchHitters.length === 0 ? (
                <Text color="$gray9" fontSize="$1" padding="$2">
                  No hitters on the bench.
                </Text>
              ) : (
                benchHitters.map((p) => (
                  <BenchRow
                    key={p.id}
                    name={getPlayerName(p)}
                    eligible={p.player?.eligiblePositions ?? []}
                    primaryPosition={p.player?.eligiblePositions?.[0] ?? ''}
                    selected={selected?.id === p.id}
                    readOnly={readOnly}
                    onPress={() => handleBenchSelect(p)}
                    onPlayerPress={
                      onPlayerPress ? () => onPlayerPress(p) : undefined
                    }
                  />
                ))
              )}
            </YStack>
            <YStack gap="$2">
              <Text fontSize="$2" color="$gray10">
                Pitchers · {benchPitchers.length}
              </Text>
              {benchPitchers.length === 0 ? (
                <Text color="$gray9" fontSize="$1" padding="$2">
                  No pitchers on the bench.
                </Text>
              ) : (
                benchPitchers.map((p) => (
                  <BenchRow
                    key={p.id}
                    name={getPlayerName(p)}
                    eligible={p.player?.eligiblePositions ?? []}
                    primaryPosition={p.player?.eligiblePositions?.[0] ?? ''}
                    selected={selected?.id === p.id}
                    readOnly={readOnly}
                    onPress={() => handleBenchSelect(p)}
                    onPlayerPress={
                      onPlayerPress ? () => onPlayerPress(p) : undefined
                    }
                  />
                ))
              )}
            </YStack>
            {moveToBenchEnabled && selected && (
              <Text
                role="button"
                aria-label={`Move ${selectedName} to bench`}
                tabIndex={0}
                fontSize="$2"
                fontWeight="600"
                color="$blue11"
                hoverStyle={{ color: '$blue12' }}
                onPress={() => {
                  const pos = positions.find(
                    (p) => p.id === selected.positionId,
                  );
                  if (pos) {
                    onPlayerRemove(pos);
                    setSelected(null);
                  }
                }}
              >
                Move {selectedName} to bench
              </Text>
            )}
          </YStack>
        )}
      </SectionCard>
    </YStack>
  );
}
