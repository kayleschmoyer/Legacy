import React, { useMemo, useState } from 'react';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { CSS } from './styles';
import { BaseballCard } from './BaseballCard';

interface DraftCompleteViewProps {
  league: { isMockDraft?: boolean; name?: string } | null | undefined;
  leagueId: number | null;
  pickHistory: DraftPickRecord[];
  myTeamId: number | null;
  myTeam: DraftPlayer[];
  myTeamPicks: DraftPickRecord[];
  leagueTeams: LeagueTeam[];
  statsLookup: Map<number, DraftPlayer>;
  onNavigate: (path: string) => void;
}

export function DraftCompleteView({
  league,
  leagueId,
  pickHistory,
  myTeamId,
  myTeam,
  myTeamPicks,
  leagueTeams,
  statsLookup,
  onNavigate,
}: DraftCompleteViewProps): React.JSX.Element {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    myTeamId !== null ? String(myTeamId) : null,
  );

  const selectedTeamPicks = useMemo(
    () =>
      selectedTeamId
        ? pickHistory.filter((p) => String(p.teamId) === selectedTeamId)
        : myTeamPicks,
    [pickHistory, selectedTeamId, myTeamPicks],
  );

  const selectedTeamPlayers: DraftPlayer[] = useMemo(
    () =>
      selectedTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        const name = pick.player
          ? `${pick.player.firstName} ${pick.player.lastName}`
          : `Unknown Player (ID: ${pick.playerId})`;
        return {
          id: pick.playerId,
          name,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [selectedTeamPicks, statsLookup],
  );

  const selectedTeamName = useMemo(() => {
    if (!selectedTeamId) return 'Your Roster';
    const team = leagueTeams.find((t) => String(t.id) === selectedTeamId);
    return team?.name ?? 'Unknown Team';
  }, [selectedTeamId, leagueTeams]);

  const isViewingOwnTeam =
    selectedTeamId !== null && selectedTeamId === String(myTeamId);

  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-state-center">
        <div className="d-state-icon">
          <span role="img" aria-label="trophy">
            🏆
          </span>
        </div>
        <div className="d-state-title">Draft Complete!</div>
        <div className="d-state-desc">
          {league?.isMockDraft
            ? `All ${pickHistory.length} picks have been made. No rosters were saved — this was a practice draft.`
            : `All ${pickHistory.length} picks have been made. Your roster is set!`}
        </div>

        {/* Action buttons — shown for real (non-mock) drafts */}
        {!league?.isMockDraft && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 8,
            }}
          >
            <button
              className="d-state-btn"
              onClick={() => onNavigate(`/baseball/league/${leagueId}/roster`)}
            >
              Set My Lineup
            </button>
            <button
              className="d-state-btn"
              style={{ background: 'rgba(255,255,255,0.1)' }}
              onClick={() => onNavigate(`/baseball/league/${leagueId}`)}
            >
              Back to League
            </button>
          </div>
        )}

        {/* Mock draft buttons */}
        {league?.isMockDraft && (
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 8,
            }}
          >
            <button
              className="d-state-btn"
              onClick={() => onNavigate('/baseball/mock-draft')}
            >
              Practice Again
            </button>
            <button
              className="d-state-btn"
              style={{ background: 'rgba(255,255,255,0.1)' }}
              onClick={() => onNavigate('/baseball')}
            >
              Go to My Leagues
            </button>
          </div>
        )}

        {/* Team selector + roster cards */}
        {leagueTeams.length > 0 && (
          <div style={{ maxWidth: 480, width: '100%', marginTop: 24 }}>
            {/* Team tab bar */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              {leagueTeams.map((team) => {
                const isActive = selectedTeamId === String(team.id);
                const isMe = String(team.id) === String(myTeamId);
                return (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(String(team.id))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: isActive
                        ? '1px solid var(--d-accent)'
                        : '1px solid rgba(255,255,255,0.15)',
                      background: isActive
                        ? 'rgba(197,165,90,0.2)'
                        : 'rgba(255,255,255,0.05)',
                      color: isActive
                        ? 'var(--d-accent-light, #D4BB78)'
                        : 'var(--d-text-secondary)',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {team.name}
                    {isMe ? ' (You)' : ''}
                  </button>
                );
              })}
            </div>

            {/* Roster header */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: 'var(--d-accent)',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {isViewingOwnTeam
                ? `Your Roster (${selectedTeamPlayers.length} players)`
                : `${selectedTeamName} (${selectedTeamPlayers.length} players)`}
            </div>

            {/* Roster cards */}
            <div className="bc-wide-grid">
              {selectedTeamPicks.map((pick, i) => {
                const p = selectedTeamPlayers[i];
                if (!p) return null;
                return (
                  <BaseballCard
                    key={pick.id}
                    player={p}
                    round={pick.round}
                    pickNumber={pick.pickNumber}
                    overallPick={pick.overallPick}
                  />
                );
              })}
            </div>

            {selectedTeamPicks.length === 0 && (
              <div
                style={{
                  color: 'var(--d-text-secondary)',
                  fontSize: 13,
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                No picks found for this team.
              </div>
            )}
          </div>
        )}

        {/* Fallback: show own roster if no teams data */}
        {leagueTeams.length === 0 && myTeam.length > 0 && (
          <div style={{ maxWidth: 400, width: '100%', marginTop: 16 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 12,
                color: 'var(--d-accent)',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Your Roster ({myTeam.length} players)
            </div>
            <div className="bc-wide-grid">
              {myTeamPicks.map((pick, i) => {
                const p = myTeam[i];
                if (!p) return null;
                return (
                  <BaseballCard
                    key={pick.id}
                    player={p}
                    round={pick.round}
                    pickNumber={pick.pickNumber}
                    overallPick={pick.overallPick}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
