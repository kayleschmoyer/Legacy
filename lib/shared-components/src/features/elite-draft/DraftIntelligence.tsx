import React, { useEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { getPositionColor } from './utils';
import {
  GetDraftRecommendations as GET_DRAFT_RECOMMENDATIONS,
  type GetDraftRecommendationsQuery,
  type GetDraftRecommendationsQueryVariables,
} from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Draft Intelligence Panel — server-driven (LS-467)
//
// Calls getDraftRecommendations on the server and re-fetches after each pick
// so the suggestions stay current throughout the draft.
// ---------------------------------------------------------------------------

export function DraftIntelligence({
  draftId,
  teamId,
  currentOverallPick,
  onDraft,
}: {
  /** The active draft ID. Panel is hidden when null. */
  draftId: number | null;
  /** The team whose positional needs drive the recommendations. */
  teamId: number | null;
  /** Increments each time a pick is made; triggers a refetch. */
  currentOverallPick: number;
  /** Called with the recommended player's ID when the user clicks "Draft". */
  onDraft?: (playerId: number) => void;
}) {
  const skip = !draftId || !teamId;

  const { data, loading, refetch } = useQuery<
    GetDraftRecommendationsQuery,
    GetDraftRecommendationsQueryVariables
  >(GET_DRAFT_RECOMMENDATIONS, {
    variables: { draftId: draftId ?? 0, teamId: teamId ?? 0 },
    skip,
    fetchPolicy: 'cache-and-network',
  });

  // Re-fetch whenever a new pick is recorded so recommendations stay fresh.
  useEffect(() => {
    if (!skip) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when pick number changes
  }, [currentOverallPick]);

  const recommendations = data?.getDraftRecommendations ?? [];

  // Track which player ID is staged for confirmation (null = none pending)
  const [pendingConfirm, setPendingConfirm] = useState<number | null>(null);

  // Clear pending confirmation when picks change (new pick = new round = stale confirm)
  useEffect(() => {
    setPendingConfirm(null);
  }, [currentOverallPick]);

  // Show nothing while the very first load is in-flight (no cached data yet).
  if (loading && recommendations.length === 0) return null;
  if (recommendations.length === 0) return null;

  return (
    <div className="d-intel-panel">
      <div className="d-intel-title">BEST AVAILABLE</div>
      <div className="d-intel-list">
        {recommendations.map((rec, i) => {
          if (!rec) return null;
          return (
            <div
              key={rec.playerId}
              className="d-intel-item"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <div className="d-intel-header-row">
                <span className="d-intel-rank">#{i + 1}</span>
                <span className="d-intel-name">{rec.playerName}</span>
                <span
                  className="d-intel-pos"
                  style={{ background: getPositionColor(rec.position ?? '') }}
                >
                  {rec.position}
                </span>
              </div>
              <div className="d-intel-stats-row">
                {(rec.topStats ?? []).map((s) => {
                  if (!s) return null;
                  return (
                    <span key={s.label} className="d-intel-stat-pill">
                      <span className="d-intel-stat-val">{s.value}</span>
                      <span className="d-intel-stat-lbl">{s.label}</span>
                    </span>
                  );
                })}
                <div className="d-intel-score-bar-wrap">
                  <div
                    className="d-intel-score-bar"
                    style={{
                      width: `${Math.round((rec.score ?? 0) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="d-intel-reason">{rec.reason}</div>
              {onDraft &&
                rec.playerId != null &&
                rec.playerName != null &&
                (pendingConfirm === rec.playerId ? (
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button
                      className="d-intel-draft-btn"
                      style={{ flex: 1 }}
                      onClick={() => {
                        const pid = rec.playerId;
                        if (pid != null && onDraft) {
                          onDraft(pid);
                          setPendingConfirm(null);
                        }
                      }}
                      aria-label={`Confirm draft ${rec.playerName}`}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      style={{
                        padding: '5px 10px',
                        borderRadius: 'var(--d-radius-sm)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--d-text-secondary)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                      }}
                      onClick={() => setPendingConfirm(null)}
                      aria-label="Cancel"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="d-intel-draft-btn"
                    onClick={() => setPendingConfirm(rec.playerId ?? null)}
                    aria-label={`Draft ${rec.playerName}`}
                  >
                    <span aria-hidden="true">⚡</span> Draft
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
