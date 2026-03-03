import React, { useMemo } from 'react';
import { type DraftPickRecord, type DraftPlayer } from './types';
import { computeDraftIntelligence } from './draftUtils';
import { getPositionColor } from './utils';

// ---------------------------------------------------------------------------
// Draft Intelligence Panel
// ---------------------------------------------------------------------------

export function DraftIntelligence({
  statsLookup,
  pickHistory,
  myTeamId,
}: {
  statsLookup: Map<number, DraftPlayer>;
  pickHistory: DraftPickRecord[];
  myTeamId: number | null;
}) {
  const recommendations = useMemo(
    () => computeDraftIntelligence(statsLookup, pickHistory, myTeamId),
    [statsLookup, pickHistory, myTeamId],
  );

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
        {recommendations.map((rec, i) => (
          <div
            key={rec.player.id}
            className="d-intel-item"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <div className="d-intel-header-row">
              <span className="d-intel-rank">#{i + 1}</span>
              <span className="d-intel-name">{rec.player.name}</span>
              <span
                className="d-intel-pos"
                style={{ background: getPositionColor(rec.player.position) }}
              >
                {rec.player.position}
              </span>
            </div>
            <div className="d-intel-stats-row">
              {rec.topStats.map((s) => (
                <span key={s.label} className="d-intel-stat-pill">
                  <span className="d-intel-stat-val">{s.value}</span>
                  <span className="d-intel-stat-lbl">{s.label}</span>
                </span>
              ))}
              <div className="d-intel-score-bar-wrap">
                <div
                  className="d-intel-score-bar"
                  style={{ width: `${Math.round(rec.score * 100)}%` }}
                />
              </div>
            </div>
            <div className="d-intel-reason">{rec.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
