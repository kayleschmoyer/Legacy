import React, { useEffect } from 'react';
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
}: {
  /** The active draft ID. Panel is hidden when null. */
  draftId: number | null;
  /** The team whose positional needs drive the recommendations. */
  teamId: number | null;
  /** Increments each time a pick is made; triggers a refetch. */
  currentOverallPick: number;
}) {
  const skip = !draftId || !teamId;

  const { data, loading, refetch } = useQuery<
    GetDraftRecommendationsQuery,
    GetDraftRecommendationsQueryVariables
  >(GET_DRAFT_RECOMMENDATIONS, {
    variables: { draftId: draftId!, teamId: teamId! },
    skip,
    fetchPolicy: 'cache-and-network',
  });

  // Re-fetch whenever a new pick is recorded so recommendations stay fresh.
  useEffect(() => {
    if (!skip) {
      void refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOverallPick]);

  const recommendations = data?.getDraftRecommendations ?? [];

  // Show nothing while the very first load is in-flight (no cached data yet).
  if (loading && recommendations.length === 0) return null;
  if (recommendations.length === 0) return null;

  return (
    <div className="d-intel-panel">
      <div className="d-intel-title">
        <span role="img" aria-label="lightning">
          ⚡
        </span>{' '}
        DRAFT INTELLIGENCE
      </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
