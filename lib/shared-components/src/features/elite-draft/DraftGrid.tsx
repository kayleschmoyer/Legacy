import React, { useMemo } from 'react';
import {
  type CurrentDraftPickInfo,
  type DraftPickRecord,
  type DraftPlayer,
  type LeagueTeam,
} from './types';
import { getPositionColor, normalizeTeamId } from './utils';

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
  autoPickTeamIds = new Set<string>(),
  onlineTeamIds = new Set<string>(),
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  maxRounds: number;
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
            {/* Online indicator dot (LS-478) */}
            <span
              aria-label={
                onlineTeamIds.has(String(team.id)) ? 'online' : 'offline'
              }
              title={
                onlineTeamIds.has(String(team.id))
                  ? 'Manager is online'
                  : 'Manager is offline'
              }
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: onlineTeamIds.has(String(team.id))
                  ? '#10b981'
                  : 'rgba(148,163,184,0.35)',
                marginRight: 5,
                verticalAlign: 'middle',
                flexShrink: 0,
              }}
            />
            {team.name}
            {String(team.id) === String(myTeamId) && (
              <span style={{ fontSize: 8, display: 'block', color: '#10b981' }}>
                YOU
              </span>
            )}
            {autoPickTeamIds.has(String(team.id)) && (
              <span
                title="Auto-pick enabled"
                style={{ fontSize: 10, display: 'block', color: '#a78bfa' }}
              >
                <span role="img" aria-label="robot">
                  🤖
                </span>{' '}
                AUTO
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
                const playerName = player
                  ? player.name
                  : pick.player
                    ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
                    : `Player #${pick.playerId}`;
                const position = player?.position;
                const posColor = position ? getPositionColor(position) : null;

                const cellStyle: React.CSSProperties = {
                  ...(pick.teamId === myTeamId
                    ? { borderColor: 'rgba(16,185,129,0.2)' }
                    : {}),
                  ...(posColor
                    ? {
                        borderLeftColor: posColor,
                        borderLeftWidth: 3,
                        background: `${posColor}18`,
                      }
                    : {}),
                };
                return (
                  <div
                    key={team.id}
                    className="d-draft-grid-cell filled"
                    title={`Pick #${pick.overallPick}: ${playerName}${position ? ` (${position})` : ''}`}
                    style={cellStyle}
                  >
                    {posColor && position && (
                      <span
                        style={{
                          display: 'inline-block',
                          background: posColor,
                          color: '#fff',
                          fontSize: 8,
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: 3,
                          marginBottom: 2,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {position}
                      </span>
                    )}
                    <span style={{ fontSize: 10, display: 'block' }}>
                      {playerName}
                    </span>
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
