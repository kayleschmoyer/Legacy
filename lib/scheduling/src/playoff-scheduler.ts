/**
 * Playoff Scheduler (LS-28)
 * 
 * Handles playoff bracket generation and tournament progression logic.
 * Integrates with the scheduling system for playoff matchup management.
 */

export interface PlayoffTeam {
  id: number;
  name: string;
  seedNumber: number;
  wins: number;
  losses: number;
  pointsFor: number;
}

export interface PlayoffBracketConfig {
  format: '4-team' | '6-team' | '8-team';
  teams: PlayoffTeam[];
  startWeek: number;
  weeksPerRound: number;
}

export interface PlayoffMatchup {
  round: 'wildcard' | 'semifinals' | 'finals';
  matchupNumber: number;
  weekNumber: number;
  highSeedTeam: PlayoffTeam | null;
  lowSeedTeam: PlayoffTeam | null;
}

export interface PlayoffBracket {
  format: '4-team' | '6-team' | '8-team';
  matchups: PlayoffMatchup[];
  startWeek: number;
  endWeek: number;
}

/**
 * Generate playoff bracket based on format and seeded teams
 */
export function generatePlayoffBracket(config: PlayoffBracketConfig): PlayoffBracket {
  const { format, teams, startWeek, weeksPerRound } = config;
  
  // Sort teams by seed number
  const sortedTeams = [...teams].sort((a, b) => a.seedNumber - b.seedNumber);
  
  if (format === '4-team') {
    return generate4TeamBracket(sortedTeams, startWeek, weeksPerRound);
  } else if (format === '6-team') {
    return generate6TeamBracket(sortedTeams, startWeek, weeksPerRound);
  } else {
    return generate8TeamBracket(sortedTeams, startWeek, weeksPerRound);
  }
}

/**
 * 4-team bracket: 2 semifinals, 1 final
 */
function generate4TeamBracket(
  teams: PlayoffTeam[],
  startWeek: number,
  weeksPerRound: number
): PlayoffBracket {
  const matchups: PlayoffMatchup[] = [
    // Semifinals
    {
      round: 'semifinals',
      matchupNumber: 1,
      weekNumber: startWeek,
      highSeedTeam: teams[0], // #1 seed
      lowSeedTeam: teams[3],  // #4 seed
    },
    {
      round: 'semifinals',
      matchupNumber: 2,
      weekNumber: startWeek,
      highSeedTeam: teams[1], // #2 seed
      lowSeedTeam: teams[2],  // #3 seed
    },
    // Finals (winners TBD)
    {
      round: 'finals',
      matchupNumber: 1,
      weekNumber: startWeek + weeksPerRound,
      highSeedTeam: null,
      lowSeedTeam: null,
    },
  ];

  return {
    format: '4-team',
    matchups,
    startWeek,
    endWeek: startWeek + weeksPerRound,
  };
}

/**
 * 6-team bracket: 2 wildcards, 2 semifinals, 1 final
 * Top 2 seeds get first-round bye
 */
function generate6TeamBracket(
  teams: PlayoffTeam[],
  startWeek: number,
  weeksPerRound: number
): PlayoffBracket {
  const matchups: PlayoffMatchup[] = [
    // Wildcard round
    {
      round: 'wildcard',
      matchupNumber: 1,
      weekNumber: startWeek,
      highSeedTeam: teams[2], // #3 seed
      lowSeedTeam: teams[5],  // #6 seed
    },
    {
      round: 'wildcard',
      matchupNumber: 2,
      weekNumber: startWeek,
      highSeedTeam: teams[3], // #4 seed
      lowSeedTeam: teams[4],  // #5 seed
    },
    // Semifinals (#1 and #2 get byes)
    {
      round: 'semifinals',
      matchupNumber: 1,
      weekNumber: startWeek + weeksPerRound,
      highSeedTeam: teams[0], // #1 seed
      lowSeedTeam: null,      // Wildcard winner TBD
    },
    {
      round: 'semifinals',
      matchupNumber: 2,
      weekNumber: startWeek + weeksPerRound,
      highSeedTeam: teams[1], // #2 seed
      lowSeedTeam: null,      // Wildcard winner TBD
    },
    // Finals
    {
      round: 'finals',
      matchupNumber: 1,
      weekNumber: startWeek + weeksPerRound * 2,
      highSeedTeam: null,
      lowSeedTeam: null,
    },
  ];

  return {
    format: '6-team',
    matchups,
    startWeek,
    endWeek: startWeek + weeksPerRound * 2,
  };
}

/**
 * 8-team bracket: 4 wildcards, 2 semifinals, 1 final
 */
function generate8TeamBracket(
  teams: PlayoffTeam[],
  startWeek: number,
  weeksPerRound: number
): PlayoffBracket {
  const matchups: PlayoffMatchup[] = [
    // Wildcard round (quarterfinals)
    {
      round: 'wildcard',
      matchupNumber: 1,
      weekNumber: startWeek,
      highSeedTeam: teams[0], // #1 seed
      lowSeedTeam: teams[7],  // #8 seed
    },
    {
      round: 'wildcard',
      matchupNumber: 2,
      weekNumber: startWeek,
      highSeedTeam: teams[1], // #2 seed
      lowSeedTeam: teams[6],  // #7 seed
    },
    {
      round: 'wildcard',
      matchupNumber: 3,
      weekNumber: startWeek,
      highSeedTeam: teams[2], // #3 seed
      lowSeedTeam: teams[5],  // #6 seed
    },
    {
      round: 'wildcard',
      matchupNumber: 4,
      weekNumber: startWeek,
      highSeedTeam: teams[3], // #4 seed
      lowSeedTeam: teams[4],  // #5 seed
    },
    // Semifinals
    {
      round: 'semifinals',
      matchupNumber: 1,
      weekNumber: startWeek + weeksPerRound,
      highSeedTeam: null, // Wildcard winner TBD
      lowSeedTeam: null,  // Wildcard winner TBD
    },
    {
      round: 'semifinals',
      matchupNumber: 2,
      weekNumber: startWeek + weeksPerRound,
      highSeedTeam: null, // Wildcard winner TBD
      lowSeedTeam: null,  // Wildcard winner TBD
    },
    // Finals
    {
      round: 'finals',
      matchupNumber: 1,
      weekNumber: startWeek + weeksPerRound * 2,
      highSeedTeam: null,
      lowSeedTeam: null,
    },
  ];

  return {
    format: '8-team',
    matchups,
    startWeek,
    endWeek: startWeek + weeksPerRound * 2,
  };
}

/**
 * Determine playoff matchups for next round based on completed results
 */
export function advancePlayoffRound(
  currentRound: 'wildcard' | 'semifinals',
  winners: PlayoffTeam[]
): PlayoffMatchup[] {
  if (currentRound === 'wildcard') {
    // Advance winners to semifinals
    // Typically reseed so highest seed plays lowest remaining seed
    const reseeded = [...winners].sort((a, b) => a.seedNumber - b.seedNumber);
    
    return [
      {
        round: 'semifinals',
        matchupNumber: 1,
        weekNumber: 0, // Will be set by caller
        highSeedTeam: reseeded[0],
        lowSeedTeam: reseeded[reseeded.length - 1],
      },
      {
        round: 'semifinals',
        matchupNumber: 2,
        weekNumber: 0,
        highSeedTeam: reseeded[1],
        lowSeedTeam: reseeded[reseeded.length - 2],
      },
    ];
  } else {
    // Semifinals winners advance to finals
    return [
      {
        round: 'finals',
        matchupNumber: 1,
        weekNumber: 0,
        highSeedTeam: winners[0],
        lowSeedTeam: winners[1],
      },
    ];
  }
}

/**
 * Check if a playoff round is complete
 */
export function isRoundComplete(
  matchups: PlayoffMatchup[],
  round: 'wildcard' | 'semifinals' | 'finals'
): boolean {
  const roundMatchups = matchups.filter(m => m.round === round);
  return roundMatchups.length > 0 && roundMatchups.every(m => 
    m.highSeedTeam !== null && m.lowSeedTeam !== null
  );
}
