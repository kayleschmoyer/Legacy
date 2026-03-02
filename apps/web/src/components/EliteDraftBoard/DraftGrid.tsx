import React, { useMemo } from 'react';
import {
  type CurrentDraftPickInfo,
  type DraftPickRecord,
  type DraftPlayer,
  type LeagueTeam,
} from './types';
import { normalizeTeamId } from './utils';

// ---------------------------------------------------------------------------
// Draft Grid Sub-component (team columns view)
// ---------------------------------------------------------------------------

export function DraftGrid({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  maxRounds,
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  maxRounds: number;
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
    <div className="d-draft-grid-view">
      <div
        className="d-draft-grid-table"
        style={{
          gridTemplateColumns: `60px repeat(${teams.length}, minmax(100px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div
          className="d-draft-grid-header"
          style={{ background: 'transparent' }}
        >
          Round
        </div>
        {teams.map((team) => (
          <div
            key={team.id}
            className={`d-draft-grid-header${
              currentTeamId !== null &&
              String(team.id) === String(currentTeamId)
                ? ' on-clock'
                : ''
            }`}
            style={
              String(team.id) === String(myTeamId)
                ? { borderBottomColor: '#10b981' }
                : undefined
            }
          >
            {team.name}
            {String(team.id) === String(myTeamId) && (
              <span style={{ fontSize: 8, display: 'block', color: '#10b981' }}>
                YOU
              </span>
            )}
          </div>
        ))}

        {/* Round rows */}
        {rounds.map((round) => (
          <React.Fragment key={round}>
            <div
              className="d-draft-grid-cell"
              style={{
                fontWeight: 700,
                color: 'var(--d-text-secondary)',
                fontSize: 11,
              }}
            >
              R{round}
            </div>
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
                const playerName = player ? player.name : `#${pick.playerId}`;
                return (
                  <div
                    key={team.id}
                    className="d-draft-grid-cell filled"
                    title={`Pick #${pick.overallPick}: ${playerName}`}
                    style={
                      pick.teamId === myTeamId
                        ? { borderColor: 'rgba(16,185,129,0.2)' }
                        : undefined
                    }
                  >
                    <span style={{ fontSize: 10 }}>{playerName}</span>
                  </div>
                );
              }

              return (
                <div
                  key={team.id}
                  className={`d-draft-grid-cell${isCurrent ? ' current' : ''}`}
                >
                  {isCurrent ? '🎯' : '—'}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
