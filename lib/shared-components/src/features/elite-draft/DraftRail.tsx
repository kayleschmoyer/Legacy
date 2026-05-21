import React from 'react';
import type { DraftPickRecord, DraftPlayer } from './types';
import { DraftIntelligence } from './DraftIntelligence';
import { DraftQueuePanel } from './DraftQueuePanel';
import { getPositionColor } from './utils';
import type { Sport } from '../../utils/colors';

// Position slot configuration for the depth-chart-style roster summary,
// sport-scoped per ADR 0011 §6 / LS-4663.
type PositionSlotConfig = { pos: string; label: string; slots: number };

const BASEBALL_POSITION_SLOTS: PositionSlotConfig[] = [
  { pos: 'C', label: 'C', slots: 1 },
  { pos: '1B', label: '1B', slots: 1 },
  { pos: '2B', label: '2B', slots: 1 },
  { pos: '3B', label: '3B', slots: 1 },
  { pos: 'SS', label: 'SS', slots: 1 },
  { pos: 'OF', label: 'OF', slots: 3 },
  { pos: 'P', label: 'P', slots: 9 },
  { pos: 'U', label: 'UTIL', slots: 2 },
];

const FOOTBALL_POSITION_SLOTS: PositionSlotConfig[] = [
  { pos: 'QB', label: 'QB', slots: 1 },
  { pos: 'RB', label: 'RB', slots: 2 },
  { pos: 'WR', label: 'WR', slots: 3 },
  { pos: 'TE', label: 'TE', slots: 1 },
  { pos: 'K', label: 'K', slots: 1 },
  { pos: 'DEF', label: 'DEF', slots: 1 },
  { pos: 'FLEX', label: 'FLEX', slots: 1 },
];

export function getPositionSlotsForSport(sport: Sport): PositionSlotConfig[] {
  return sport === 'football'
    ? FOOTBALL_POSITION_SLOTS
    : BASEBALL_POSITION_SLOTS;
}

interface DraftRailProps {
  // Intelligence
  isPremium: boolean;
  isMyPick: boolean;
  commPickMode: boolean;
  isOwner: boolean;
  draftId: number | null;
  myTeamId: number | null;
  currentOverallPick: number;
  // Queue
  autoPickDisabled: boolean;
  // Roster
  myTeam: DraftPlayer[];
  positionCounts: Record<string, number>;
  /** League sport — drives depth-chart slot layout and roster-bar fill colors. */
  sport?: Sport;
  // History
  pickHistory: DraftPickRecord[];
  statsLookup: Map<number, DraftPlayer>;
  teamNameById: (teamId: number | null | undefined) => string;
  // Actions
  onShowToast: (msg: string) => void;
  onDraftPlayer: (playerId: number) => void;
  onCommissionerPick: (playerId: number) => void;
}

function playerName(
  pick: DraftPickRecord,
  statsLookup: Map<number, DraftPlayer>,
): string {
  const stat = statsLookup.get(pick.playerId);
  if (stat) return stat.name;
  if (pick.player) return `${pick.player.firstName} ${pick.player.lastName}`;
  return `Player #${pick.playerId}`;
}

function pickRoundLabel(pick: DraftPickRecord): string {
  return `${pick.round}.${pick.pickNumber.toString().padStart(2, '0')}`;
}

function getPositionPill(pos: string): { bg: string; color: string } {
  const color = getPositionColor('baseball', pos);
  return { bg: `${color}26`, color }; // 15% opacity bg
}

export function DraftRail({
  isPremium,
  isMyPick,
  commPickMode,
  isOwner,
  draftId,
  myTeamId,
  currentOverallPick,
  autoPickDisabled,
  myTeam,
  positionCounts,
  sport = 'baseball',
  pickHistory,
  statsLookup,
  teamNameById,
  onShowToast,
  onDraftPlayer,
  onCommissionerPick,
}: DraftRailProps): React.JSX.Element {
  const positionSlots = getPositionSlotsForSport(sport);
  const totalDrafted = myTeam.length;
  const totalSlots = positionSlots.reduce((sum, s) => sum + s.slots, 0);

  return (
    <aside className="d-rail" aria-label="Draft panel">
      {/* Draft Intelligence — only on user's pick */}
      {isMyPick && (
        <div className="d-intel-panel">
          <div className="d-intel-title">
            Draft Intelligence
            {isPremium && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  color: 'var(--d-accent)',
                  fontWeight: 700,
                }}
              >
                ✦ PREMIUM
              </span>
            )}
          </div>
          <DraftIntelligence
            draftId={draftId}
            teamId={myTeamId}
            currentOverallPick={currentOverallPick}
            onDraft={
              commPickMode && isOwner ? onCommissionerPick : onDraftPlayer
            }
          />
        </div>
      )}

      {/* Auto-pick Queue */}
      {draftId && myTeamId !== null && (
        <div className="d-rail-panel d-queue-panel">
          <div className="d-rail-panel-head">
            <h4 className="d-rail-panel-title">Auto-pick Queue</h4>
          </div>
          <DraftQueuePanel
            draftId={draftId}
            autoPickDisabled={autoPickDisabled}
            onError={onShowToast}
          />
        </div>
      )}

      {/* My Roster — progress bars */}
      <div className="d-rail-panel">
        <div className="d-rail-panel-head">
          <h4 className="d-rail-panel-title">My Roster</h4>
          <span className="d-rail-panel-count num">
            {totalDrafted} / {totalSlots}
          </span>
        </div>
        <div className="d-pos-progress-list" role="list">
          {positionSlots.map(({ pos, label, slots }) => {
            const count = positionCounts[pos] ?? 0;
            const fill = slots > 0 ? Math.min(1, count / slots) : 0;
            const barColor = getPositionColor(sport ?? 'baseball', pos);
            const isFilled = count > 0;
            const isComplete = count >= slots;
            return (
              <div
                key={pos}
                className={`d-pos-progress-row${isFilled ? ' filled' : ''}${isComplete ? ' complete' : ''}`}
                role="listitem"
                aria-label={`${label}: ${count} of ${slots}`}
              >
                <span className="d-pos-progress-label">{label}</span>
                <div className="d-pos-progress-bar" aria-hidden="true">
                  <div
                    className="d-pos-progress-fill"
                    style={{ width: `${fill * 100}%`, background: barColor }}
                  />
                </div>
                <span className="d-pos-progress-count num">
                  {count}/{slots}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pick History */}
      {pickHistory.length > 0 && (
        <div
          className="d-rail-panel"
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="d-rail-panel-head">
            <h4 className="d-rail-panel-title">Pick History</h4>
            <span className="d-rail-panel-count num">{pickHistory.length}</span>
          </div>
          <div
            style={{ overflowY: 'auto', flex: 1 }}
            role="list"
            aria-label="Recent draft picks"
          >
            {pickHistory
              .slice()
              .reverse()
              .slice(0, 40)
              .map((pick) => {
                const name = playerName(pick, statsLookup);
                const pos =
                  statsLookup.get(pick.playerId)?.position ??
                  pick.player?.eligiblePositions?.[0] ??
                  '?';
                const isMine = pick.teamId === myTeamId;
                const pill = getPositionPill(pos);
                return (
                  <div
                    key={pick.id}
                    className={`d-pick-row${isMine ? ' mine' : ''}`}
                    role="listitem"
                  >
                    <span className="d-pick-num num">
                      {pickRoundLabel(pick)}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 700,
                        color: pill.color,
                        background: pill.bg,
                        whiteSpace: 'nowrap',
                        fontFamily: "'Big Shoulders Display', sans-serif",
                        letterSpacing: '0.06em',
                        flexShrink: 0,
                      }}
                    >
                      {pos}
                    </span>
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 12,
                        color: isMine ? 'var(--d-accent)' : 'var(--d-text)',
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--d-text-muted)',
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {teamNameById(pick.teamId)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </aside>
  );
}
