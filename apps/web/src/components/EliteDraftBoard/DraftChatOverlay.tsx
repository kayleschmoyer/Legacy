import React from 'react';
import type { LeagueTeam } from './types';
import { LeagueChatTab } from '../../features/baseball/LeagueChatTab';

interface DraftChatOverlayProps {
  leagueId: number;
  userId: number;
  leagueTeams: LeagueTeam[];
  onClose: () => void;
}

export function DraftChatOverlay({
  leagueId,
  userId,
  leagueTeams,
  onClose,
}: DraftChatOverlayProps): React.JSX.Element {
  return (
    <div
      className="d-chat-overlay"
      role="complementary"
      aria-label="League chat"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--d-border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--d-accent)',
            textTransform: 'uppercase',
          }}
        >
          <span role="img" aria-label="chat">
            💬
          </span>{' '}
          League Chat
        </span>
        <button
          className="d-btn-glass"
          style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={onClose}
          aria-label="Close league chat"
        >
          ✕
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <LeagueChatTab
          leagueId={leagueId}
          userId={userId}
          mentionableTeams={leagueTeams.map((t) => ({
            id: parseInt(t.id, 10),
            name: t.name,
          }))}
        />
      </div>
    </div>
  );
}
