import React, { useMemo } from 'react';
import type { DraftPlayer } from './types';
import { buildDepthChartBuckets } from './DraftPlayerBoard';
import { getPositionColor } from './utils';
import type { SportKind } from '../../config/sports';

// ---------------------------------------------------------------------------
// SpectatorDepthChart — read-only depth chart for the on-the-clock team
// (LS-8942). Purely presentational: groups the team's drafted players into
// the league's configured roster slots via buildDepthChartBuckets (which is
// team-agnostic — it buckets whatever player list it is given) and renders
// filled vs open slots so the room can see the picking team's needs.
// ---------------------------------------------------------------------------

export interface SpectatorDepthChartProps {
  /** Name of the team currently on the clock. */
  teamName: string;
  /** The on-the-clock team's drafted players so far. */
  players: DraftPlayer[];
  /** League's configured roster slots. */
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  sport: SportKind;
  maxRosterSize: number | null;
}

export function SpectatorDepthChart({
  teamName,
  players,
  leaguePositions,
  sport,
  maxRosterSize,
}: SpectatorDepthChartProps): React.JSX.Element {
  const buckets = useMemo(
    () =>
      buildDepthChartBuckets(leaguePositions, players, sport, maxRosterSize),
    [leaguePositions, players, sport, maxRosterSize],
  );

  return (
    <div className="d-rail-panel" data-testid="spectator-depth-chart">
      <div className="d-eyebrow">On the clock</div>
      <div className="d-spec-depth-team">{teamName}</div>
      <div className="d-spec-depth-buckets">
        {buckets.map((bucket) => {
          const open = Math.max(0, bucket.total - bucket.players.length);
          const posColor = getPositionColor(sport, bucket.positionType);
          return (
            <div className="d-spec-depth-bucket" key={bucket.positionType}>
              <span className="d-spec-depth-pos" style={{ color: posColor }}>
                {bucket.positionType}
              </span>
              <span className="d-spec-depth-fill d-tnum">
                {bucket.players.length}/{bucket.total}
              </span>
              <div className="d-spec-depth-players">
                {bucket.players.map((p) => (
                  <span className="d-spec-depth-player" key={p.id}>
                    {p.name}
                  </span>
                ))}
                {open > 0 && (
                  <span className="d-spec-depth-open">
                    {open} open {open === 1 ? 'slot' : 'slots'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
