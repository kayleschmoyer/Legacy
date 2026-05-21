import React, { useCallback, useMemo, useState } from 'react';
import {
  ALLOWED_POSITIONS,
  PITCHING_POSITIONS,
} from '@legacy-sports/shared-components/utils';
import { I } from './Icons';
import { initialsFromName, positionClass, Section } from './Shared';
import {
  type LeaguePositionFragment,
  type TeamMemberFragment,
} from '../../../api/db/graphql.generated';

// ── Position classification ───────────────────────────────────────────────────

const PITCHER_SLOTS = new Set(['SP', 'RP', 'P']);

const isPitcherSlot = (positionType: string | null | undefined): boolean =>
  PITCHER_SLOTS.has((positionType ?? '').toUpperCase());

const getEligible = (player: TeamMemberFragment): string[] =>
  player.player?.eligiblePositions ?? [];

const playerHasPitchingOnly = (player: TeamMemberFragment): boolean => {
  const eligible = getEligible(player);
  if (eligible.length === 0) return false;
  return eligible.every((p) => PITCHING_POSITIONS.has(p));
};

const playerHasBatting = (player: TeamMemberFragment): boolean => {
  const eligible = getEligible(player);
  if (eligible.length === 0) return true; // unclassified default to hitters group
  return eligible.some((p) => !PITCHING_POSITIONS.has(p));
};

const canPlayerPlayPosition = (
  player: TeamMemberFragment,
  position: LeaguePositionFragment,
): boolean => {
  const eligible = getEligible(player);
  if (eligible.length === 0) return true;
  const allowed = ALLOWED_POSITIONS[position.positionType ?? ''];
  if (!allowed) return false;
  return eligible.some((p) => allowed.includes(p));
};

const POSITION_LABEL: Record<string, string> = {
  SP: 'Starting Pitcher',
  RP: 'Relief Pitcher',
  P: 'Pitcher',
  C: 'Catcher',
  '1B': '1st Base',
  '2B': '2nd Base',
  '3B': '3rd Base',
  SS: 'Shortstop',
  LF: 'Left Field',
  CF: 'Center Field',
  RF: 'Right Field',
  OF: 'Outfield',
  IF: 'Infield',
  UTIL: 'Utility',
  DH: 'Designated Hitter',
  XDH: 'Extra Hitter',
};

const getPlayerName = (player: TeamMemberFragment): string => {
  if (player.nickname) return player.nickname;
  const p = player.player;
  if (!p) return 'Empty';
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Empty';
};

// ── Row primitives ────────────────────────────────────────────────────────────

// Pace-target tint mirrors paceColorStyle in Shared.tsx — kept here as a thin
// inline helper because RosterBoardV2 currently does not have per-player
// matchup data wired (out of scope per LS-4674: must reuse existing queries
// only). Returns undefined for every row today, which renders neutral; the
// CSS variable hook is preserved so a future ticket that surfaces score/proj
// inside the roster tab can drop the values in without touching this file.
const paceColorStyle = (
  actual: number | null | undefined,
  proj: number | null | undefined,
  gamesPlayed: number | null | undefined,
  gamesRemaining: number | null | undefined,
): React.CSSProperties | undefined => {
  if (proj == null || actual == null) return undefined;
  const total =
    gamesPlayed != null && gamesRemaining != null
      ? gamesPlayed + gamesRemaining
      : 0;
  const frac = total > 0 ? gamesPlayed! / total : 1;
  if (frac === 0) return undefined;
  const target = proj * frac;
  if (target <= 0) return undefined;
  const ratio = (actual - target) / target;
  if (ratio >= 0.1) return { color: 'var(--success-fg)' };
  if (ratio <= -0.1) return { color: 'var(--danger-fg)' };
  return undefined;
};

interface SlotRowProps {
  position: LeaguePositionFragment;
  assigned?: TeamMemberFragment;
  selected: TeamMemberFragment | null;
  state: 'idle' | 'selected' | 'eligible-empty' | 'eligible-swap';
  onPress: () => void;
  readOnly: boolean;
}

const SlotRow: React.FC<SlotRowProps> = ({
  position,
  assigned,
  selected,
  state,
  onPress,
  readOnly,
}) => {
  const posType = (position.positionType ?? '').toUpperCase();
  const klass = positionClass(posType);
  const assignedName = assigned ? getPlayerName(assigned) : null;
  const assignedEligible = assigned ? getEligible(assigned) : [];

  const stateClass =
    state === 'selected'
      ? 'ls-roster-slot-selected'
      : state === 'eligible-swap'
        ? 'ls-roster-slot-swap'
        : state === 'eligible-empty'
          ? 'ls-roster-slot-target'
          : '';

  const ariaLabel = assignedName
    ? state === 'eligible-swap' && selected
      ? `Swap ${getPlayerName(selected)} into ${posType}`
      : `${assignedName} at ${posType}`
    : state === 'eligible-empty' && selected
      ? `Assign ${getPlayerName(selected)} to ${posType}`
      : `${POSITION_LABEL[posType] ?? posType} — open slot`;

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!readOnly) onPress();
    }
  };

  return (
    <div
      className={`ls-player-row ${klass} ${stateClass}`}
      role="button"
      tabIndex={readOnly ? -1 : 0}
      aria-pressed={state === 'selected'}
      aria-disabled={readOnly}
      aria-label={ariaLabel}
      onClick={readOnly ? undefined : onPress}
      onKeyDown={onKeyDown}
      style={readOnly ? undefined : { cursor: 'pointer' }}
    >
      <div className="ls-player-slot">{posType}</div>
      <div className="ls-player-info">
        <div
          className={`ls-avatar sm ${
            klass === 'pitcher'
              ? 'red'
              : klass === 'outfield'
                ? 'green'
                : klass === 'infield'
                  ? 'brown'
                  : 'navy'
          }`}
        >
          {assignedName ? initialsFromName(assignedName) : '—'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ls-player-name">
            <span className={`ls-pchip ${klass}`}>{posType}</span>
            <span>{assignedName ?? POSITION_LABEL[posType] ?? posType}</span>
          </div>
          <div className="ls-player-sub">
            {assignedName
              ? assignedEligible.join(' · ')
              : state === 'eligible-empty' && selected
                ? `Tap to assign ${getPlayerName(selected)}`
                : 'Open slot'}
          </div>
        </div>
      </div>
      <div className="ls-player-score">
        <div className="actual" style={paceColorStyle(null, null, null, null)}>
          —
        </div>
      </div>
    </div>
  );
};

interface BenchRowProps {
  player: TeamMemberFragment;
  selected: boolean;
  onSelect: () => void;
  readOnly: boolean;
}

const BenchRow: React.FC<BenchRowProps> = ({
  player,
  selected,
  onSelect,
  readOnly,
}) => {
  const eligible = getEligible(player);
  const primaryEligible = eligible[0] ?? '';
  const klass = positionClass(primaryEligible);

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!readOnly) onSelect();
    }
  };

  return (
    <div
      className={`ls-player-row bench ${klass} ${selected ? 'ls-roster-slot-selected' : ''}`}
      role="button"
      tabIndex={readOnly ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={readOnly}
      aria-label={`${getPlayerName(player)} — bench${selected ? ', selected' : ''}`}
      onClick={readOnly ? undefined : onSelect}
      onKeyDown={onKeyDown}
      style={readOnly ? undefined : { cursor: 'pointer' }}
    >
      <div className="ls-player-slot">BN</div>
      <div className="ls-player-info">
        <div
          className={`ls-avatar sm ${
            klass === 'pitcher'
              ? 'red'
              : klass === 'outfield'
                ? 'green'
                : klass === 'infield'
                  ? 'brown'
                  : 'navy'
          }`}
        >
          {initialsFromName(getPlayerName(player))}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ls-player-name">
            <span>{getPlayerName(player)}</span>
          </div>
          <div className="ls-player-sub">
            {eligible.length > 0 ? eligible.join(' · ') : 'Unclassified'}
          </div>
        </div>
      </div>
      <div className="ls-player-score">
        <div className="actual" style={paceColorStyle(null, null, null, null)}>
          —
        </div>
      </div>
    </div>
  );
};

// ── Section helpers ───────────────────────────────────────────────────────────

interface SlotGroupProps {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  selected: TeamMemberFragment | null;
  onSlotPress: (position: LeaguePositionFragment) => void;
  readOnly: boolean;
}

const SlotGroup: React.FC<SlotGroupProps> = ({
  positions,
  teamPlayers,
  selected,
  onSlotPress,
  readOnly,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {positions.map((position) => {
      const assigned = teamPlayers.find((p) => p.positionId === position.id);
      let state: SlotRowProps['state'] = 'idle';
      if (selected) {
        const canAccept = canPlayerPlayPosition(selected, position);
        if (assigned?.id === selected.id) {
          state = 'selected';
        } else if (assigned && canAccept) {
          state = 'eligible-swap';
        } else if (!assigned && canAccept) {
          state = 'eligible-empty';
        }
      }
      return (
        <SlotRow
          key={position.id}
          position={position}
          assigned={assigned}
          selected={selected}
          state={state}
          onPress={() => onSlotPress(position)}
          readOnly={readOnly}
        />
      );
    })}
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────

export interface RosterBoardV2Props {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly TeamMemberFragment[];
  onPlayerAssign: (
    player: TeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  onPlayerSwap: (
    incoming: TeamMemberFragment,
    target: LeaguePositionFragment,
    displaced: TeamMemberFragment,
  ) => void;
  loading?: boolean;
  error?: Error | null;
  readOnly?: boolean;
}

export const RosterBoardV2: React.FC<RosterBoardV2Props> = ({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSwap,
  loading = false,
  error = null,
  readOnly = false,
}) => {
  const [selected, setSelected] = useState<TeamMemberFragment | null>(null);

  const { hitterSlots, pitcherSlots } = useMemo(() => {
    const hitters: LeaguePositionFragment[] = [];
    const pitchers: LeaguePositionFragment[] = [];
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
    const hitters: TeamMemberFragment[] = [];
    const pitchers: TeamMemberFragment[] = [];
    for (const p of benchPlayers) {
      if (playerHasPitchingOnly(p)) pitchers.push(p);
      else if (playerHasBatting(p)) hitters.push(p);
      else hitters.push(p); // safety fallback
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
    (position: LeaguePositionFragment) => {
      if (readOnly) return;
      const assigned = teamPlayers.find((p) => p.positionId === position.id);
      if (!selected) {
        if (assigned) setSelected(assigned);
        return;
      }
      // Clicking the already-selected player's slot — deselect
      if (assigned && assigned.id === selected.id) {
        setSelected(null);
        return;
      }
      const canAccept = canPlayerPlayPosition(selected, position);
      if (assigned && canAccept) {
        onPlayerSwap(selected, position, assigned);
        setSelected(null);
        return;
      }
      if (!assigned && canAccept) {
        onPlayerAssign(selected, position);
        setSelected(null);
        return;
      }
      // Selected can't play here — switch selection to occupant (or deselect)
      if (assigned) setSelected(assigned);
      else setSelected(null);
    },
    [readOnly, selected, teamPlayers, onPlayerAssign, onPlayerSwap],
  );

  const handleBenchSelect = useCallback(
    (player: TeamMemberFragment) => {
      if (readOnly) return;
      // Tap a bench row while a lineup player is selected → bench that player
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
      <Section title="Roster">
        <div className="ls-empty">Loading roster…</div>
      </Section>
    );
  }

  if (error) {
    return (
      <Section title="Roster">
        <div className="ls-empty" role="alert">
          <h3>Failed to load roster</h3>
          <p>Refresh the page to try again.</p>
        </div>
      </Section>
    );
  }

  const moveToBenchEnabled = !readOnly && selected?.positionId != null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {selected && !readOnly && (
        <div
          className="ls-banner ls-banner-info"
          role="status"
          aria-live="polite"
        >
          <div className="ls-banner-icon">
            <I.Users size={18} />
          </div>
          <div className="ls-banner-body">
            <div className="ls-banner-title">
              {getPlayerName(selected)} selected
            </div>
            <div className="ls-banner-sub">
              {selected.positionId != null
                ? 'Tap an eligible slot to swap, or tap the bench to send this player there.'
                : 'Tap an eligible lineup slot to assign.'}
            </div>
          </div>
          <div className="ls-banner-actions">
            <button
              type="button"
              className="ls-btn ls-btn-ghost sm"
              onClick={() => setSelected(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Section
        title="Starting Hitters"
        right={
          <span className="ls-card-sub">
            {filledHitters}/{hitterSlots.length}
          </span>
        }
      >
        {hitterSlots.length === 0 ? (
          <div className="ls-empty">No hitter slots configured.</div>
        ) : (
          <SlotGroup
            positions={hitterSlots}
            teamPlayers={teamPlayers}
            selected={selected}
            onSlotPress={handleSlotPress}
            readOnly={readOnly}
          />
        )}
      </Section>

      <Section
        title="Starting Pitchers"
        right={
          <span className="ls-card-sub">
            {filledPitchers}/{pitcherSlots.length}
          </span>
        }
      >
        {pitcherSlots.length === 0 ? (
          <div className="ls-empty">No pitcher slots configured.</div>
        ) : (
          <SlotGroup
            positions={pitcherSlots}
            teamPlayers={teamPlayers}
            selected={selected}
            onSlotPress={handleSlotPress}
            readOnly={readOnly}
          />
        )}
      </Section>

      <Section
        title="Bench"
        right={
          <span className="ls-card-sub">{benchPlayers.length} players</span>
        }
      >
        {benchPlayers.length === 0 && !moveToBenchEnabled ? (
          <div className="ls-empty">
            Bench is empty. Add free agents or move players from the lineup.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="ls-card-sub" style={{ marginBottom: 6 }}>
                Hitters · {benchHitters.length}
              </div>
              {benchHitters.length === 0 ? (
                <div
                  className="ls-empty"
                  style={{ padding: '12px 14px', fontSize: 12 }}
                >
                  No hitters on the bench.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {benchHitters.map((p) => (
                    <BenchRow
                      key={p.id}
                      player={p}
                      selected={selected?.id === p.id}
                      onSelect={() => handleBenchSelect(p)}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="ls-card-sub" style={{ marginBottom: 6 }}>
                Pitchers · {benchPitchers.length}
              </div>
              {benchPitchers.length === 0 ? (
                <div
                  className="ls-empty"
                  style={{ padding: '12px 14px', fontSize: 12 }}
                >
                  No pitchers on the bench.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {benchPitchers.map((p) => (
                    <BenchRow
                      key={p.id}
                      player={p}
                      selected={selected?.id === p.id}
                      onSelect={() => handleBenchSelect(p)}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              )}
            </div>
            {moveToBenchEnabled && selected && (
              <button
                type="button"
                className="ls-btn ls-btn-ghost sm"
                onClick={() => {
                  const pos = positions.find(
                    (p) => p.id === selected.positionId,
                  );
                  if (pos) {
                    onPlayerRemove(pos);
                    setSelected(null);
                  }
                }}
              >
                Move {getPlayerName(selected)} to bench
              </button>
            )}
          </div>
        )}
      </Section>
    </div>
  );
};
