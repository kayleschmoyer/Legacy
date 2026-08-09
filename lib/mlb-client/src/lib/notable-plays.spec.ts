import {
  extractNotablePlays,
  scoreBatterPlay,
  scorePitcherPlay,
} from './notable-plays';
import type { MlbApiGameFeedResponse } from './providers/mlb-statsapi.api-types';

describe('scoreBatterPlay', () => {
  it('scores a home run above a single', () => {
    const hr = scoreBatterPlay('home_run', null, null);
    const single = scoreBatterPlay('single', null, null);
    expect(hr).not.toBeNull();
    expect(single).not.toBeNull();
    expect(hr as number).toBeGreaterThan(single as number);
  });

  it('adds exit-velocity and distance bonuses', () => {
    const plain = scoreBatterPlay('home_run', null, null) as number;
    const crushed = scoreBatterPlay('home_run', 112.4, 440) as number;
    expect(crushed).toBeGreaterThan(plain);
    // 22.4 mph over the floor * 1.5 + 440/40 distance
    expect(crushed).toBeCloseTo(plain + 22.4 * 1.5 + 11, 1);
  });

  it('returns null for untracked non-notable events', () => {
    expect(scoreBatterPlay('walk', null, null)).toBeNull();
    expect(scoreBatterPlay('strikeout', null, null)).toBeNull();
  });

  it('still scores tracked contact on unlisted events', () => {
    expect(scoreBatterPlay('field_out', 105.1, 380)).not.toBeNull();
  });

  it('does not award an exit-velo bonus at or below the floor', () => {
    expect(scoreBatterPlay('single', 90, null)).toBe(
      scoreBatterPlay('single', null, null),
    );
  });
});

describe('scorePitcherPlay', () => {
  it('scores strikeouts only', () => {
    expect(scorePitcherPlay('strikeout', null)).toBe(40);
    expect(scorePitcherPlay('home_run', 99)).toBeNull();
  });

  it('adds a velocity bonus above the floor', () => {
    expect(scorePitcherPlay('strikeout', 99)).toBe(40 + (99 - 93) * 2);
    expect(scorePitcherPlay('strikeout', 88)).toBe(40);
  });
});

function feedFixture(): MlbApiGameFeedResponse {
  return {
    gameData: { datetime: { officialDate: '2026-08-05' } },
    liveData: {
      plays: {
        allPlays: [
          {
            result: {
              eventType: 'home_run',
              description: 'Aaron Judge homers (40) on a fly ball.',
            },
            about: { isComplete: true },
            matchup: { batter: { id: 592450 }, pitcher: { id: 621111 } },
            playEvents: [
              {
                isPitch: true,
                playId: 'abc-123',
                hitData: {
                  launchSpeed: 112.4,
                  launchAngle: 28,
                  totalDistance: 441,
                },
                pitchData: { startSpeed: 96.2 },
                details: { type: { description: 'Four-Seam Fastball' } },
              },
            ],
          },
          {
            result: {
              eventType: 'single',
              description: 'Aaron Judge singles on a line drive.',
            },
            about: { isComplete: true },
            matchup: { batter: { id: 592450 }, pitcher: { id: 621111 } },
            playEvents: [
              {
                isPitch: true,
                playId: 'def-456',
                hitData: { launchSpeed: 98.0, launchAngle: 12 },
              },
            ],
          },
          {
            result: {
              eventType: 'strikeout',
              description: 'Juan Soto strikes out swinging.',
            },
            about: { isComplete: true },
            matchup: { batter: { id: 665742 }, pitcher: { id: 621111 } },
            playEvents: [
              {
                isPitch: true,
                playId: 'ghi-789',
                pitchData: { startSpeed: 99.1 },
                details: { type: { description: 'Slider' } },
              },
            ],
          },
          {
            // Incomplete play must be ignored.
            result: { eventType: 'home_run', description: 'in progress' },
            about: { isComplete: false },
            matchup: { batter: { id: 700001 } },
            playEvents: [],
          },
        ],
      },
    },
  };
}

describe('extractNotablePlays', () => {
  it('keeps only the best play per player, both roles', () => {
    const plays = extractNotablePlays(feedFixture(), 777);
    const byId = new Map(plays.map((p) => [p.mlbPlayerId, p]));

    // Batter: home run beats the single.
    const judge = byId.get(592450);
    expect(judge?.eventType).toBe('home_run');
    expect(judge?.playerRole).toBe('batter');
    expect(judge?.exitVelocity).toBe(112.4);
    expect(judge?.launchAngle).toBe(28);
    expect(judge?.hitDistance).toBe(441);
    expect(judge?.playId).toBe('abc-123');
    expect(judge?.gamePk).toBe(777);
    expect(judge?.gameDate).toBe('2026-08-05');

    // Pitcher: strikeout is his notable play, with pitch metrics.
    const pitcher = byId.get(621111);
    expect(pitcher?.playerRole).toBe('pitcher');
    expect(pitcher?.eventType).toBe('strikeout');
    expect(pitcher?.pitchSpeed).toBe(99.1);
    expect(pitcher?.pitchType).toBe('Slider');
    expect(pitcher?.exitVelocity).toBeNull();

    // Incomplete play ignored entirely.
    expect(byId.has(700001)).toBe(false);
    // The struck-out batter has no notable batting play.
    expect(byId.has(665742)).toBe(false);
  });

  it('returns an empty list for a feed without plays', () => {
    expect(extractNotablePlays({}, 1)).toEqual([]);
  });
});
