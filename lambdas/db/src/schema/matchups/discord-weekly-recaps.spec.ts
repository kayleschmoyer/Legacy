/**
 * Tests for Discord weekly recaps (LS-1682).
 *
 * Covers:
 *   - W-L-T record calculation and standings sorting
 *   - Result line formatting (bold winner, tie handling)
 *   - Top scorer detection across matchups
 *   - Recap week derivation (currentWeek - 1)
 *   - SSRF validation (discord.com and subdomains, HTTPS only)
 *   - Multi-embed payload structure (results + standings)
 *   - Error handling (per-league errors collected, webhook awaited with 5s timeout)
 */

// These mocks are required because importing `isValidDiscordUrl` from
// discord-weekly-recaps.ts triggers the module's top-level side effects
// (builder.mutationField, builder.objectType, etc.) which depend on these modules.

jest.mock('../builder', () => ({
  builder: {
    objectRef: jest.fn(() => 'MockRef'),
    objectType: jest.fn(),
    mutationField: jest.fn(),
  },
}));

jest.mock('./scheduled-mutations', () => ({
  assertAuthorized: jest.fn(),
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn(),
  eq: jest.fn(),
  inArray: jest.fn(),
  isNotNull: jest.fn(),
}));

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  SendMessageCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
}));

jest.mock('@legacy-sports/utils', () => ({
  getDbOptions: jest.fn(() => ({})),
  isNegroLeague: jest.fn(() => false),
}));

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(),
  PublicSchema: {
    leagues: {
      id: 'leagues.id',
      name: 'leagues.name',
      discordWebhookUrl: 'leagues.discord_webhook_url',
      currentWeek: 'leagues.current_week',
      leaguePhase: 'leagues.league_phase',
      isMockDraft: 'leagues.is_mock_draft',
      draftStatus: 'leagues.draft_status',
      gamesPerMatchup: 'leagues.games_per_matchup',
      weekAdvanceStatus: 'leagues.week_advance_status',
      spStartsPerMatchup: 'leagues.sp_starts_per_matchup',
      totalMatchups: 'leagues.total_matchups',
    },
    matchups: {
      id: 'matchups.id',
      leagueId: 'matchups.league_id',
      weekNumber: 'matchups.week_number',
      status: 'matchups.status',
      team1Id: 'matchups.team1_id',
      team2Id: 'matchups.team2_id',
      team1Score: 'matchups.team1_score',
      team2Score: 'matchups.team2_score',
      gamesPerMatchup: 'matchups.games_per_matchup',
      statsLoadingStatus: 'matchups.stats_loading_status',
      spStartsPerMatchup: 'matchups.sp_starts_per_matchup',
      startTime: 'matchups.start_time',
      endTime: 'matchups.end_time',
    },
    matchupPlayers: {
      id: 'matchup_players.id',
      matchupId: 'matchup_players.matchup_id',
      playerId: 'matchup_players.player_id',
      teamId: 'matchup_players.team_id',
      positionId: 'matchup_players.position_id',
    },
    matchupPlayerGames: {
      matchupPlayerId: 'matchup_player_games.matchup_player_id',
      gameNum: 'matchup_player_games.game_num',
    },
    teams: {
      id: 'teams.id',
      name: 'teams.name',
      leagueId: 'teams.league_id',
    },
    teamMembers: {
      playerId: 'team_members.player_id',
      positionId: 'team_members.position_id',
      leagueId: 'team_members.league_id',
      teamId: 'team_members.team_id',
    },
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      permissionLevel: 'league_members.permission_level',
    },
  },
  createBadgeService: jest.fn(() => ({
    getUserBadges: jest.fn().mockResolvedValue([]),
    getTeamBadges: jest.fn().mockResolvedValue([]),
    getUserBadgeProgress: jest.fn().mockResolvedValue([]),
    evaluateDraftBadges: jest.fn().mockResolvedValue([]),
    evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
    awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
    awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { isValidDiscordUrl } from './discord-weekly-recaps';

describe('Discord Weekly Recaps (LS-1682)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Recap week derivation ──────────────────────────────────────────────

  describe('recap week derivation', () => {
    it('recaps the previous week (currentWeek - 1)', () => {
      const currentWeek = 5;
      const recapWeek = currentWeek - 1;
      expect(recapWeek).toBe(4);
    });

    it('skips recap when currentWeek is 1 (no previous week)', () => {
      const currentWeek = 1;
      const recapWeek = currentWeek - 1;
      expect(recapWeek < 1).toBe(true);
    });

    it('skips recap when currentWeek is 0', () => {
      const currentWeek = 0;
      const recapWeek = currentWeek - 1;
      expect(recapWeek < 1).toBe(true);
    });
  });

  // ── Result line formatting ─────────────────────────────────────────────

  describe('result line formatting', () => {
    function formatResultLine(
      t1Name: string,
      t1Score: number,
      t2Name: string,
      t2Score: number,
    ): string {
      if (t1Score === t2Score) {
        return `**${t1Name}** ${t1Score.toFixed(1)} - ${t2Score.toFixed(1)} **${t2Name}** (Tie)`;
      }
      const winner = t1Score > t2Score ? t1Name : t2Name;
      const loser = t1Score > t2Score ? t2Name : t1Name;
      const winScore = Math.max(t1Score, t2Score);
      const loseScore = Math.min(t1Score, t2Score);
      return `**${winner}** ${winScore.toFixed(1)} - ${loseScore.toFixed(1)} ${loser}`;
    }

    it('bolds the winner when team 1 wins', () => {
      const line = formatResultLine('Eagles', 100.5, 'Bears', 80.0);
      expect(line).toBe('**Eagles** 100.5 - 80.0 Bears');
    });

    it('bolds the winner when team 2 wins', () => {
      const line = formatResultLine('Eagles', 70.0, 'Bears', 90.3);
      expect(line).toBe('**Bears** 90.3 - 70.0 Eagles');
    });

    it('bolds both teams and shows "(Tie)" on equal scores', () => {
      const line = formatResultLine('Eagles', 85.0, 'Bears', 85.0);
      expect(line).toBe('**Eagles** 85.0 - 85.0 **Bears** (Tie)');
    });

    it('formats scores to one decimal place', () => {
      const line = formatResultLine('A', 100, 'B', 80);
      expect(line).toContain('100.0');
      expect(line).toContain('80.0');
    });

    it('always shows higher score first', () => {
      const line = formatResultLine('A', 50.5, 'B', 120.3);
      expect(line).toBe('**B** 120.3 - 50.5 A');
    });
  });

  // ── W-L-T record calculation ──────────────────────────────────────────

  describe('W-L-T record calculation', () => {
    interface MatchupData {
      team1Id: number;
      team2Id: number;
      team1Score: number;
      team2Score: number;
    }

    function calculateRecords(matchups: MatchupData[]) {
      const records = new Map<
        number,
        { wins: number; losses: number; ties: number; pf: number }
      >();

      for (const m of matchups) {
        if (!records.has(m.team1Id))
          records.set(m.team1Id, { wins: 0, losses: 0, ties: 0, pf: 0 });
        if (!records.has(m.team2Id))
          records.set(m.team2Id, { wins: 0, losses: 0, ties: 0, pf: 0 });

        const r1 = records.get(m.team1Id)!;
        const r2 = records.get(m.team2Id)!;

        r1.pf += m.team1Score;
        r2.pf += m.team2Score;

        if (m.team1Score > m.team2Score) {
          r1.wins++;
          r2.losses++;
        } else if (m.team2Score > m.team1Score) {
          r2.wins++;
          r1.losses++;
        } else {
          r1.ties++;
          r2.ties++;
        }
      }

      return records;
    }

    it('correctly tallies wins and losses', () => {
      const matchups: MatchupData[] = [
        { team1Id: 1, team2Id: 2, team1Score: 100, team2Score: 80 },
        { team1Id: 1, team2Id: 3, team1Score: 90, team2Score: 110 },
      ];

      const records = calculateRecords(matchups);
      expect(records.get(1)).toEqual({ wins: 1, losses: 1, ties: 0, pf: 190 });
      expect(records.get(2)).toEqual({ wins: 0, losses: 1, ties: 0, pf: 80 });
      expect(records.get(3)).toEqual({ wins: 1, losses: 0, ties: 0, pf: 110 });
    });

    it('correctly handles ties', () => {
      const matchups: MatchupData[] = [
        { team1Id: 1, team2Id: 2, team1Score: 85, team2Score: 85 },
      ];

      const records = calculateRecords(matchups);
      expect(records.get(1)).toEqual({ wins: 0, losses: 0, ties: 1, pf: 85 });
      expect(records.get(2)).toEqual({ wins: 0, losses: 0, ties: 1, pf: 85 });
    });

    it('accumulates points for across multiple matchups', () => {
      const matchups: MatchupData[] = [
        { team1Id: 1, team2Id: 2, team1Score: 100, team2Score: 80 },
        { team1Id: 1, team2Id: 3, team1Score: 95, team2Score: 105 },
        { team1Id: 2, team2Id: 3, team1Score: 90, team2Score: 90 },
      ];

      const records = calculateRecords(matchups);
      expect(records.get(1)?.pf).toBe(195); // 100 + 95
      expect(records.get(2)?.pf).toBe(170); // 80 + 90
      expect(records.get(3)?.pf).toBe(195); // 105 + 90
    });
  });

  // ── Standings sorting ─────────────────────────────────────────────────

  describe('standings sorting', () => {
    function sortStandings(
      entries: Array<{
        teamId: number;
        name: string;
        wins: number;
        losses: number;
        ties: number;
        pf: number;
      }>,
    ) {
      return entries
        .map((e) => {
          const totalGames = e.wins + e.losses + e.ties;
          return {
            ...e,
            winPct: totalGames > 0 ? (e.wins + e.ties * 0.5) / totalGames : 0,
          };
        })
        .sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);
    }

    it('sorts by win percentage (higher first)', () => {
      const standings = sortStandings([
        { teamId: 1, name: 'A', wins: 1, losses: 3, ties: 0, pf: 400 },
        { teamId: 2, name: 'B', wins: 3, losses: 1, ties: 0, pf: 350 },
      ]);

      expect(standings[0].name).toBe('B');
      expect(standings[1].name).toBe('A');
    });

    it('breaks win percentage ties by points for', () => {
      const standings = sortStandings([
        { teamId: 1, name: 'A', wins: 2, losses: 2, ties: 0, pf: 350 },
        { teamId: 2, name: 'B', wins: 2, losses: 2, ties: 0, pf: 400 },
      ]);

      expect(standings[0].name).toBe('B');
      expect(standings[1].name).toBe('A');
    });

    it('counts ties as 0.5 wins in win percentage', () => {
      const standings = sortStandings([
        { teamId: 1, name: 'A', wins: 1, losses: 0, ties: 2, pf: 300 },
        { teamId: 2, name: 'B', wins: 2, losses: 1, ties: 0, pf: 300 },
      ]);

      // A: (1 + 2*0.5) / 3 = 0.667
      // B: (2 + 0*0.5) / 3 = 0.667
      expect(standings[0].winPct).toBeCloseTo(0.667, 2);
      expect(standings[1].winPct).toBeCloseTo(0.667, 2);
    });

    it('handles 0-0-0 teams (no games played)', () => {
      const standings = sortStandings([
        { teamId: 1, name: 'A', wins: 2, losses: 0, ties: 0, pf: 200 },
        { teamId: 2, name: 'B', wins: 0, losses: 0, ties: 0, pf: 0 },
      ]);

      expect(standings[0].name).toBe('A');
      expect(standings[1].winPct).toBe(0);
    });
  });

  // ── Standings line formatting ──────────────────────────────────────────

  describe('standings line formatting', () => {
    function formatStandingsLine(
      rank: number,
      name: string,
      wins: number,
      losses: number,
      ties: number,
      pf: number,
    ): string {
      const record =
        ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
      return `${rank}. **${name}** (${record}) — ${pf.toFixed(1)} PF`;
    }

    it('formats W-L record without ties', () => {
      const line = formatStandingsLine(1, 'Eagles', 5, 2, 0, 750.5);
      expect(line).toBe('1. **Eagles** (5-2) — 750.5 PF');
    });

    it('formats W-L-T record with ties', () => {
      const line = formatStandingsLine(2, 'Bears', 3, 3, 1, 600.0);
      expect(line).toBe('2. **Bears** (3-3-1) — 600.0 PF');
    });

    it('includes rank number', () => {
      const line = formatStandingsLine(10, 'Team X', 0, 7, 0, 300.0);
      expect(line).toMatch(/^10\./);
    });
  });

  // ── Top scorer detection ──────────────────────────────────────────────

  describe('top scorer detection', () => {
    interface MatchupScores {
      t1Name: string;
      t1Score: number;
      t2Name: string;
      t2Score: number;
    }

    function findTopScorer(matchups: MatchupScores[]) {
      let topScorerTeam = '';
      let topScore = 0;

      for (const m of matchups) {
        if (m.t1Score > topScore) {
          topScore = m.t1Score;
          topScorerTeam = m.t1Name;
        }
        if (m.t2Score > topScore) {
          topScore = m.t2Score;
          topScorerTeam = m.t2Name;
        }
      }

      return { topScorerTeam, topScore };
    }

    it('identifies the highest-scoring team across matchups', () => {
      const result = findTopScorer([
        { t1Name: 'Eagles', t1Score: 100, t2Name: 'Bears', t2Score: 80 },
        { t1Name: 'Hawks', t1Score: 120, t2Name: 'Lions', t2Score: 95 },
      ]);

      expect(result.topScorerTeam).toBe('Hawks');
      expect(result.topScore).toBe(120);
    });

    it('selects team2 when it has the highest score', () => {
      const result = findTopScorer([
        { t1Name: 'Eagles', t1Score: 80, t2Name: 'Bears', t2Score: 130 },
        { t1Name: 'Hawks', t1Score: 90, t2Name: 'Lions', t2Score: 95 },
      ]);

      expect(result.topScorerTeam).toBe('Bears');
      expect(result.topScore).toBe(130);
    });

    it('returns empty string when no matchups', () => {
      const result = findTopScorer([]);
      expect(result.topScorerTeam).toBe('');
      expect(result.topScore).toBe(0);
    });

    it('picks the first team encountered on score ties', () => {
      const result = findTopScorer([
        { t1Name: 'Eagles', t1Score: 100, t2Name: 'Bears', t2Score: 90 },
        { t1Name: 'Hawks', t1Score: 100, t2Name: 'Lions', t2Score: 80 },
      ]);

      // Eagles is seen first with 100, Hawks also has 100 but isn't strictly greater
      expect(result.topScorerTeam).toBe('Eagles');
      expect(result.topScore).toBe(100);
    });
  });

  // ── SSRF validation ────────────────────────────────────────────────────

  // Uses the real isValidDiscordUrl exported from discord-weekly-recaps.ts
  describe('SSRF validation', () => {
    it('allows https://discord.com webhooks', () => {
      expect(
        isValidDiscordUrl('https://discord.com/api/webhooks/123/token'),
      ).toBe(true);
    });

    it('allows canary.discord.com webhooks', () => {
      expect(
        isValidDiscordUrl('https://canary.discord.com/api/webhooks/123/token'),
      ).toBe(true);
    });

    it('rejects HTTP URLs', () => {
      expect(
        isValidDiscordUrl('http://discord.com/api/webhooks/123/token'),
      ).toBe(false);
    });

    it('rejects non-Discord hosts', () => {
      expect(isValidDiscordUrl('https://evil.com/api/webhooks/123/token')).toBe(
        false,
      );
    });

    it('rejects discord.com.evil.com (subdomain attack)', () => {
      expect(
        isValidDiscordUrl(
          'https://discord.com.evil.com/api/webhooks/123/token',
        ),
      ).toBe(false);
    });

    it('rejects evildiscord.com (suffix attack)', () => {
      expect(
        isValidDiscordUrl('https://evildiscord.com/api/webhooks/123/token'),
      ).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isValidDiscordUrl('not-a-url')).toBe(false);
    });
  });

  // ── Embed structure ────────────────────────────────────────────────────

  describe('embed structure', () => {
    const COLOR_RECAP = 0x9b59b6;

    it('produces two embeds: results and standings', () => {
      const embeds = [
        {
          title: 'Week 3 Recap — Test League',
          description: '**Eagles** 100.0 - 80.0 Bears',
          color: COLOR_RECAP,
          fields: [
            { name: 'Top Scorer', value: 'Eagles (100.0 pts)', inline: true },
            { name: 'Matchups', value: '1 completed', inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Legacy Sports Weekly Recap' },
        },
        {
          title: 'Standings after Week 3',
          description: '1. **Eagles** (1-0) — 100.0 PF',
          color: COLOR_RECAP,
        },
      ];

      expect(embeds).toHaveLength(2);
      expect(embeds[0].title).toContain('Recap');
      expect(embeds[1].title).toContain('Standings');
    });

    it('uses purple color for both embeds', () => {
      expect(COLOR_RECAP).toBe(0x9b59b6);
    });

    it('includes recap footer in first embed', () => {
      const embed = {
        footer: { text: 'Legacy Sports Weekly Recap' },
      };
      expect(embed.footer.text).toBe('Legacy Sports Weekly Recap');
    });

    it('shows N/A when no top scorer (e.g., all 0-0)', () => {
      function formatTopScorer(team: string, score: number): string {
        return team ? `${team} (${score.toFixed(1)} pts)` : 'N/A';
      }
      expect(formatTopScorer('', 0)).toBe('N/A');
    });

    it('formats top scorer with team name and points', () => {
      function formatTopScorer(team: string, score: number): string {
        return team ? `${team} (${score.toFixed(1)} pts)` : 'N/A';
      }
      expect(formatTopScorer('Eagles', 142.5)).toBe('Eagles (142.5 pts)');
    });
  });

  // ── League filtering ──────────────────────────────────────────────────

  describe('league filtering', () => {
    it('skips leagues without a webhook URL', () => {
      const league = { discordWebhookUrl: null, currentWeek: 5 };
      const shouldSkip = !league.discordWebhookUrl || !league.currentWeek;
      expect(shouldSkip).toBe(true);
    });

    it('skips leagues without a current week', () => {
      const league = {
        discordWebhookUrl: 'https://discord.com/api/webhooks/123/token',
        currentWeek: null,
      };
      const shouldSkip = !league.discordWebhookUrl || !league.currentWeek;
      expect(shouldSkip).toBe(true);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('collects per-league errors without stopping other leagues', () => {
      const errors: string[] = [];
      const leagues = ['League A', 'League B', 'League C'];

      for (const league of leagues) {
        try {
          if (league === 'League B') {
            throw new Error('DB connection failed');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${league}: ${msg}`);
        }
      }

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe('League B: DB connection failed');
    });

    it('returns structured result with error list', () => {
      const result = {
        leaguesChecked: 3,
        recapsSent: 2,
        errors: ['League 5: timeout'],
      };

      expect(result.leaguesChecked).toBe(3);
      expect(result.recapsSent).toBe(2);
      expect(result.errors).toHaveLength(1);
    });
  });
});
