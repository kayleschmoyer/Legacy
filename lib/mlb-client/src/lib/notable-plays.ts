/**
 * Notable-play extraction + scoring from MLB game-feed play-by-play (LS-9095).
 *
 * Pure functions — no HTTP, no provider state — so the heuristic is directly
 * unit-testable. `MlbStatsApiProvider.getNotablePlays` is a thin wrapper that
 * fetches the feed and delegates here.
 *
 * The notability heuristic is deliberately simple and deterministic: a base
 * score per event type plus bonuses for Statcast metrics (exit velocity,
 * distance, pitch speed). It only needs to rank plays well enough to pick one
 * "highlight moment" per player for the draft-splash stat graphic.
 */
import type {
  MlbApiGameFeedResponse,
  MlbApiPlay,
  MlbApiPlayEvent,
} from './providers/mlb-statsapi.api-types';
import type { NotablePlay } from './types';

/** Base notability score per batter event type. */
const BATTER_EVENT_SCORES: Record<string, number> = {
  home_run: 80,
  grand_slam: 95,
  triple: 55,
  double: 40,
  single: 20,
  sac_fly: 15,
};

const STRIKEOUT_EVENT_TYPES = new Set(['strikeout', 'strike_out']);

/** Exit velo above this (mph) earns a bonus — roughly "hard-hit" territory. */
const EXIT_VELO_BONUS_FLOOR = 90;
/** Pitch speed above this (mph) earns a bonus for strikeout pitches. */
const PITCH_SPEED_BONUS_FLOOR = 93;

/** Last pitch event of a play — the one carrying hit/pitch data + playId. */
function lastPitchEvent(play: MlbApiPlay): MlbApiPlayEvent | null {
  const events = play.playEvents ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.isPitch) return evt;
  }
  return null;
}

/**
 * Scores a batter's completed play. Returns null when the play is not notable
 * for the batter (walks, outs without Statcast-tracked contact, etc.).
 */
export function scoreBatterPlay(
  eventType: string,
  exitVelocity: number | null,
  hitDistance: number | null,
): number | null {
  const base = BATTER_EVENT_SCORES[eventType];
  const hasTrackedContact = exitVelocity !== null;
  if (base === undefined && !hasTrackedContact) return null;

  let score = base ?? 10; // tracked contact on an unlisted event still counts a little
  if (exitVelocity !== null && exitVelocity > EXIT_VELO_BONUS_FLOOR) {
    score += (exitVelocity - EXIT_VELO_BONUS_FLOOR) * 1.5;
  }
  if (hitDistance !== null) {
    score += hitDistance / 40; // ~10 pts for a 400ft blast
  }
  return Math.round(score * 100) / 100;
}

/**
 * Scores a pitcher's completed play. Only strikeouts are notable; faster
 * put-away pitches score higher.
 */
export function scorePitcherPlay(
  eventType: string,
  pitchSpeed: number | null,
): number | null {
  if (!STRIKEOUT_EVENT_TYPES.has(eventType)) return null;
  let score = 40;
  if (pitchSpeed !== null && pitchSpeed > PITCH_SPEED_BONUS_FLOOR) {
    score += (pitchSpeed - PITCH_SPEED_BONUS_FLOOR) * 2;
  }
  return Math.round(score * 100) / 100;
}

/**
 * Extracts each player's single most notable play from a game feed.
 *
 * A play can be notable for the batter (hits, tracked contact) and/or the
 * pitcher (strikeouts) — both sides are considered independently. Per player,
 * only the highest-scored play survives.
 */
export function extractNotablePlays(
  feed: MlbApiGameFeedResponse,
  gamePk: number,
): NotablePlay[] {
  const gameDate = feed.gameData?.datetime?.officialDate ?? '';
  const best = new Map<number, NotablePlay>();

  const consider = (candidate: NotablePlay) => {
    const existing = best.get(candidate.mlbPlayerId);
    if (!existing || candidate.notabilityScore > existing.notabilityScore) {
      best.set(candidate.mlbPlayerId, candidate);
    }
  };

  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    if (!play.about?.isComplete) continue;
    const eventType = play.result?.eventType ?? '';
    const description = play.result?.description ?? '';
    if (!eventType) continue;

    const pitch = lastPitchEvent(play);
    const playId = pitch?.playId ?? null;
    const exitVelocity = pitch?.hitData?.launchSpeed ?? null;
    const launchAngle = pitch?.hitData?.launchAngle ?? null;
    const hitDistance = pitch?.hitData?.totalDistance ?? null;
    const pitchSpeed = pitch?.pitchData?.startSpeed ?? null;
    const pitchType = pitch?.details?.type?.description ?? null;

    const batterId = play.matchup?.batter?.id;
    if (batterId != null) {
      const score = scoreBatterPlay(eventType, exitVelocity, hitDistance);
      if (score !== null) {
        consider({
          mlbPlayerId: batterId,
          playerRole: 'batter',
          gamePk,
          gameDate,
          playId,
          eventType,
          description,
          exitVelocity,
          launchAngle,
          hitDistance,
          pitchSpeed: null,
          pitchType: null,
          notabilityScore: score,
        });
      }
    }

    const pitcherId = play.matchup?.pitcher?.id;
    if (pitcherId != null) {
      const score = scorePitcherPlay(eventType, pitchSpeed);
      if (score !== null) {
        consider({
          mlbPlayerId: pitcherId,
          playerRole: 'pitcher',
          gamePk,
          gameDate,
          playId,
          eventType,
          description,
          exitVelocity: null,
          launchAngle: null,
          hitDistance: null,
          pitchSpeed,
          pitchType,
          notabilityScore: score,
        });
      }
    }
  }

  return [...best.values()];
}
