import React from 'react';
import type { LeagueTeam } from './types';
import { CSS } from './styles';

interface PreDraftLobbyProps {
  league:
    | { name?: string | null; draftStatus?: string | null }
    | null
    | undefined;
  leagueTeams: LeagueTeam[];
  myTeamId: number | null;
  isOwner: boolean;
  onlineTeamIds: ReadonlySet<string>;
  customDraftOrder: string[] | null;
  setCustomDraftOrder: (v: string[] | null) => void;
  initError: string | null;
  initDraftLoading: boolean;
  onInitializeDraft: (order: 'snake' | 'linear') => Promise<void>;
}

export function PreDraftLobby({
  league,
  leagueTeams,
  myTeamId,
  isOwner,
  onlineTeamIds,
  customDraftOrder,
  setCustomDraftOrder,
  initError,
  initDraftLoading,
  onInitializeDraft,
}: PreDraftLobbyProps): React.JSX.Element {
  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-state-center">
        <div className="d-state-icon">
          <span role="img" aria-label="baseball">
            ⚾
          </span>
        </div>
        <div className="d-state-title">
          {league?.name ? `${league.name} — Live Draft` : 'Live Draft Lobby'}
        </div>
        <div className="d-state-desc">
          {leagueTeams.length < 2
            ? 'At least 2 teams are required to start a draft. Invite more teams to your league.'
            : isOwner
              ? 'As the commissioner, you can start the live draft when all teams are ready.'
              : 'Waiting for the commissioner to start the live draft.'}
        </div>

        {leagueTeams.length > 0 && (
          <div style={{ maxWidth: 320, width: '100%', marginTop: 8 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: 'var(--d-text-secondary)',
                marginBottom: 8,
              }}
            >
              {isOwner ? 'Draft Order (use arrows to reorder)' : 'Teams'} (
              {leagueTeams.length})
            </div>
            {(customDraftOrder
              ? (customDraftOrder
                  .map((id) => leagueTeams.find((t) => String(t.id) === id))
                  .filter(Boolean) as LeagueTeam[])
              : leagueTeams
            ).map((team, idx, arr) => (
              <div
                key={team.id}
                style={{
                  padding: '8px 12px',
                  background: 'var(--d-surface)',
                  border: '1px solid var(--d-border)',
                  borderRadius: 8,
                  marginBottom: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    String(team.id) === String(myTeamId)
                      ? 'var(--d-accent)'
                      : 'var(--d-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 11,
                    color: 'var(--d-text-muted)',
                    minWidth: 20,
                  }}
                >
                  {idx + 1}.
                </span>
                <span
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span
                    role="img"
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
                        ? 'var(--d-success)'
                        : 'var(--d-text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  {team.name}{' '}
                  {String(team.id) === String(myTeamId) ? '(You)' : ''}
                </span>
                {isOwner && (
                  <span style={{ display: 'flex', gap: 2 }}>
                    <button
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--d-border)',
                        borderRadius: 4,
                        color: 'var(--d-text-secondary)',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        opacity: idx === 0 ? 0.3 : 1,
                        padding: '2px 6px',
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
                      disabled={idx === 0}
                      onClick={() => {
                        const order =
                          customDraftOrder ??
                          leagueTeams.map((t) => String(t.id));
                        const next = [...order];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setCustomDraftOrder(next);
                      }}
                      aria-label={`Move ${team.name} up`}
                    >
                      ▲
                    </button>
                    <button
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--d-border)',
                        borderRadius: 4,
                        color: 'var(--d-text-secondary)',
                        cursor: idx === arr.length - 1 ? 'default' : 'pointer',
                        opacity: idx === arr.length - 1 ? 0.3 : 1,
                        padding: '2px 6px',
                        fontSize: 11,
                        fontFamily: 'inherit',
                      }}
                      disabled={idx === arr.length - 1}
                      onClick={() => {
                        const order =
                          customDraftOrder ??
                          leagueTeams.map((t) => String(t.id));
                        const next = [...order];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setCustomDraftOrder(next);
                      }}
                      aria-label={`Move ${team.name} down`}
                    >
                      ▼
                    </button>
                  </span>
                )}
              </div>
            ))}
            {isOwner && customDraftOrder && (
              <button
                style={{
                  marginTop: 4,
                  background: 'transparent',
                  border: '1px solid var(--d-border)',
                  borderRadius: 6,
                  color: 'var(--d-text-muted)',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onClick={() => setCustomDraftOrder(null)}
              >
                Reset to Default Order
              </button>
            )}
          </div>
        )}

        {initError && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              color: '#ef4444',
              fontSize: 13,
              maxWidth: 400,
            }}
          >
            {initError}
          </div>
        )}

        {isOwner && leagueTeams.length >= 2 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="d-state-btn"
              onClick={() => {
                void onInitializeDraft('snake');
              }}
              disabled={initDraftLoading}
              style={{ opacity: initDraftLoading ? 0.6 : 1 }}
            >
              {initDraftLoading ? 'Starting...' : 'Start Snake Draft'}
            </button>
            <button
              className="d-state-btn"
              onClick={() => {
                void onInitializeDraft('linear');
              }}
              disabled={initDraftLoading}
              style={{
                opacity: initDraftLoading ? 0.6 : 1,
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
              }}
            >
              {initDraftLoading ? 'Starting...' : 'Start Normal Draft'}
            </button>
          </div>
        )}

        {!isOwner && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8,
              color: '#60a5fa',
              fontSize: 13,
            }}
          >
            You&apos;ll be notified when the commissioner starts the draft.
          </div>
        )}
      </div>
    </div>
  );
}
