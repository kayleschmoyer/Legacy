import { generateMatchupRecap } from './narrative-generator';
import { type MatchupContext } from './types';

const TEAM1: MatchupContext['team1'] = {
  teamId: 1,
  teamName: 'The Bambinos',
  score: 145.5,
  performers: [
    {
      playerId: 101,
      playerName: 'Sammy Sosa',
      season: 1998,
      fantasyPoints: 42.5,
      hr: 4,
      rbi: 9,
      h: 8,
      ba: 0.308,
    },
    {
      playerId: 102,
      playerName: 'Mark McGwire',
      season: 1998,
      fantasyPoints: 28.0,
      hr: 2,
      rbi: 6,
    },
  ],
};

const TEAM2: MatchupContext['team2'] = {
  teamId: 2,
  teamName: "The Murderers' Row",
  score: 88.0,
  performers: [
    {
      playerId: 201,
      playerName: 'Bob Gibson',
      season: 1968,
      fantasyPoints: 35.0,
      isPitcher: true,
      ip: 21.0,
      k: 28,
      er: 2,
    },
  ],
};

const BASE_CONTEXT: MatchupContext = {
  matchupId: 42,
  weekNumber: 3,
  leagueId: 1,
  team1: TEAM1,
  team2: TEAM2,
};

describe('generateMatchupRecap', () => {
  it('returns a result with all required fields', () => {
    const result = generateMatchupRecap(BASE_CONTEXT);
    expect(result).toHaveProperty('headline');
    expect(result).toHaveProperty('narrative');
    expect(result).toHaveProperty('highlights');
    expect(result).toHaveProperty('matchupType');
    expect(result).toHaveProperty('winnerId');
  });

  it('identifies a blowout correctly', () => {
    const result = generateMatchupRecap(BASE_CONTEXT);
    expect(result.matchupType).toBe('blowout');
    expect(result.winnerId).toBe(TEAM1.teamId);
  });

  it('headline includes the winning team name and week number', () => {
    const result = generateMatchupRecap(BASE_CONTEXT);
    expect(result.headline).toContain(TEAM1.teamName);
    expect(result.headline).toContain('Week 3');
  });

  it('identifies a close game correctly', () => {
    const closeContext: MatchupContext = {
      ...BASE_CONTEXT,
      team1: { ...TEAM1, score: 101.0 },
      team2: { ...TEAM2, score: 98.5 },
    };
    const result = generateMatchupRecap(closeContext);
    expect(result.matchupType).toBe('close');
  });

  it('handles a tie', () => {
    const tieContext: MatchupContext = {
      ...BASE_CONTEXT,
      team1: { ...TEAM1, score: 100.0 },
      team2: { ...TEAM2, score: 100.0 },
    };
    const result = generateMatchupRecap(tieContext);
    expect(result.winnerId).toBeNull();
    expect(result.headline).toContain('tie');
  });

  it('generates highlights only for players meeting threshold', () => {
    const contextNoHighlights: MatchupContext = {
      ...BASE_CONTEXT,
      team1: {
        ...TEAM1,
        performers: [
          {
            playerId: 1,
            playerName: 'Low Performer',
            season: 1990,
            fantasyPoints: 5,
          },
        ],
      },
      team2: { ...TEAM2, performers: [] },
    };
    const result = generateMatchupRecap(contextNoHighlights);
    expect(result.highlights).toHaveLength(0);
  });

  it('narrative is deterministic for the same matchupId', () => {
    const r1 = generateMatchupRecap(BASE_CONTEXT);
    const r2 = generateMatchupRecap(BASE_CONTEXT);
    expect(r1.narrative).toBe(r2.narrative);
    expect(r1.headline).toBe(r2.headline);
  });

  it('includes season year in highlights', () => {
    const result = generateMatchupRecap(BASE_CONTEXT);
    const hasSeasonYear = result.highlights.some(
      (h) => h.includes('1998') || h.includes('1968'),
    );
    expect(hasSeasonYear).toBe(true);
  });
});
