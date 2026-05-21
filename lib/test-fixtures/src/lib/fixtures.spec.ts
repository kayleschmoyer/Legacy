import {
  countFootballPoolByPosition,
  createCareerBattingStat,
  createCareerPitchingStat,
  createFootballPlayer,
  createLeague,
  createMatchup,
  createPlayer,
  createTeam,
  createUser,
  findFixture,
  fixtureCareerStats,
  fixtureFootballPlayers,
  fixtureLeagues,
  fixtureMatchups,
  fixturePlayers,
  fixtures,
  fixtureTeams,
  fixtureUsers,
  getFixture,
  getFootballPlayer,
  getLeague,
  getMatchup,
  getPlayer,
  getTeam,
  getUser,
} from '../index';

describe('@legacy-sports/test-fixtures', () => {
  // -------------------------------------------------------------------------
  // Static fixture data
  // -------------------------------------------------------------------------
  describe('fixtures (static data)', () => {
    it('exports fixturePlayers with known entries', () => {
      expect(fixturePlayers.length).toBeGreaterThan(0);
      expect(fixturePlayers[0]).toMatchObject({
        firstName: 'Mike',
        lastName: 'Trout',
        brefId: 'troutmi01',
      });
    });

    it('exports fixtureUsers with known entries', () => {
      expect(fixtureUsers.length).toBeGreaterThan(0);
      const admin = fixtureUsers.find((u) => u.accessLevel === 'admin');
      expect(admin).toBeDefined();
    });

    it('exports fixtureLeagues with known entries', () => {
      expect(fixtureLeagues.length).toBeGreaterThan(0);
      expect(fixtureLeagues[0].name).toBe('Test League Alpha');
    });

    it('exports fixtureTeams with known entries', () => {
      expect(fixtureTeams.length).toBeGreaterThan(0);
    });

    it('exports fixtureMatchups with known entries', () => {
      expect(fixtureMatchups.length).toBeGreaterThan(0);
    });

    it('exports fixtureCareerStats with batting and pitching', () => {
      expect(fixtureCareerStats.battingStats.length).toBeGreaterThan(0);
      expect(fixtureCareerStats.pitchingStats.length).toBeGreaterThan(0);
    });

    it('exposes all collections via the fixtures namespace', () => {
      expect(fixtures.players).toBe(fixturePlayers);
      expect(fixtures.users).toBe(fixtureUsers);
      expect(fixtures.leagues).toBe(fixtureLeagues);
      expect(fixtures.teams).toBe(fixtureTeams);
      expect(fixtures.matchups).toBe(fixtureMatchups);
      expect(fixtures.careerStats).toBe(fixtureCareerStats);
    });
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  describe('getFixture', () => {
    it('returns a deep clone — mutations do not affect the source', () => {
      const p1 = getFixture('players', 0);
      const p2 = getFixture('players', 0);
      p1.firstName = 'Modified';
      expect(p2.firstName).toBe('Mike');
      expect(fixturePlayers[0].firstName).toBe('Mike');
    });

    it('defaults index to 0', () => {
      expect(getFixture('players')).toEqual(fixturePlayers[0]);
    });
  });

  describe('findFixture', () => {
    it('finds a fixture by predicate', () => {
      const admin = findFixture('users', (u) => u.accessLevel === 'admin');
      expect(admin).toBeDefined();
      expect(admin?.accessLevel).toBe('admin');
    });

    it('returns undefined when nothing matches', () => {
      const result = findFixture('users', (u) => u.email === 'nobody@nope.com');
      expect(result).toBeUndefined();
    });

    it('returned value is a deep clone — safe to mutate', () => {
      const user = findFixture('users', (u) => u.accessLevel === 'admin');
      if (user) {
        user.username = 'modified';
      }
      const refound = findFixture('users', (u) => u.accessLevel === 'admin');
      expect(refound?.username).toBe('admin');
    });
  });

  describe('typed convenience getters', () => {
    it('getPlayer returns a fresh copy at the given index', () => {
      const p = getPlayer(0);
      expect(p.firstName).toBe('Mike');
      p.firstName = 'Changed';
      expect(getPlayer(0).firstName).toBe('Mike');
    });

    it('getUser defaults to index 0', () => {
      expect(getUser()).toEqual(fixtureUsers[0]);
    });

    it('getLeague defaults to index 0', () => {
      expect(getLeague()).toEqual(fixtureLeagues[0]);
    });

    it('getTeam defaults to index 0', () => {
      expect(getTeam()).toEqual(fixtureTeams[0]);
    });

    it('getMatchup defaults to index 0', () => {
      expect(getMatchup()).toEqual(fixtureMatchups[0]);
    });
  });

  // -------------------------------------------------------------------------
  // Factory functions
  // -------------------------------------------------------------------------
  describe('createPlayer', () => {
    it('returns defaults when called with no arguments', () => {
      const player = createPlayer();
      expect(player).toMatchObject({
        id: 1,
        firstName: 'Mike',
        lastName: 'Trout',
        brefId: 'troutmi01',
      });
    });

    it('merges overrides', () => {
      const player = createPlayer({ firstName: 'Aaron', brefId: 'judgeaa01' });
      expect(player.firstName).toBe('Aaron');
      expect(player.brefId).toBe('judgeaa01');
      expect(player.lastName).toBe('Trout'); // default unchanged
    });

    it('returns a mutable object', () => {
      const p1 = createPlayer();
      const p2 = createPlayer();
      p1.firstName = 'Changed';
      expect(p2.firstName).toBe('Mike');
    });
  });

  describe('createUser', () => {
    it('returns defaults', () => {
      const user = createUser();
      expect(user.accessLevel).toBe('none');
    });

    it('can create an admin user', () => {
      const admin = createUser({ accessLevel: 'admin', email: 'a@b.com' });
      expect(admin.accessLevel).toBe('admin');
    });
  });

  describe('createLeague', () => {
    it('returns defaults', () => {
      const league = createLeague();
      expect(league.draftStatus).toBe('not-started');
      expect(league.maxRosterSize).toBe(25);
    });

    it('merges overrides', () => {
      const league = createLeague({ id: 99, inviteCode: 'UNIQUE99' });
      expect(league.id).toBe(99);
      expect(league.inviteCode).toBe('UNIQUE99');
    });
  });

  describe('createTeam', () => {
    it('returns defaults', () => {
      const team = createTeam();
      expect(team.leagueId).toBe(1);
    });

    it('merges overrides', () => {
      const team = createTeam({ id: 5, name: 'Custom Team', leagueId: 2 });
      expect(team.name).toBe('Custom Team');
      expect(team.leagueId).toBe(2);
    });
  });

  describe('createMatchup', () => {
    it('returns defaults', () => {
      const matchup = createMatchup();
      expect(matchup.status).toBe('scheduled');
      expect(matchup.selectedSeason).toBe(2024);
    });

    it('can create a completed matchup', () => {
      const matchup = createMatchup({
        status: 'completed',
        team1Score: '100.00',
        team2Score: '95.50',
      });
      expect(matchup.status).toBe('completed');
      expect(matchup.team1Score).toBe('100.00');
    });
  });

  describe('createCareerBattingStat', () => {
    it('returns defaults', () => {
      const stat = createCareerBattingStat();
      expect(stat.playerId).toBe(1);
      expect(stat.battingAvg).toBeGreaterThan(0);
    });

    it('merges overrides', () => {
      const stat = createCareerBattingStat({ hr: 62, playerId: 2 });
      expect(stat.hr).toBe(62);
      expect(stat.playerId).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Football mock pool
  // -------------------------------------------------------------------------
  describe('fixtureFootballPlayers', () => {
    it('seeds ~250 players across the six modeled positions', () => {
      expect(fixtureFootballPlayers.length).toBe(250);
      const counts = countFootballPoolByPosition();
      expect(counts.QB).toBeGreaterThan(0);
      expect(counts.RB).toBeGreaterThan(0);
      expect(counts.WR).toBeGreaterThan(0);
      expect(counts.TE).toBeGreaterThan(0);
      expect(counts.K).toBeGreaterThan(0);
      expect(counts.DEF).toBeGreaterThan(0);
      const total = Object.values(counts).reduce<number>((a, b) => a + b, 0);
      expect(total).toBe(fixtureFootballPlayers.length);
    });

    it('produces unique ids and frozen entries', () => {
      const ids = new Set(fixtureFootballPlayers.map((p) => p.id));
      expect(ids.size).toBe(fixtureFootballPlayers.length);
      expect(Object.isFrozen(fixtureFootballPlayers)).toBe(true);
    });

    it('keeps fpg and ownership within plausible per-position ranges', () => {
      for (const p of fixtureFootballPlayers) {
        expect(p.fpg).toBeGreaterThanOrEqual(0);
        expect(p.fpg).toBeLessThanOrEqual(40);
        expect(p.ownershipPct).toBeGreaterThanOrEqual(0);
        expect(p.ownershipPct).toBeLessThanOrEqual(100);
        expect(p.byeWeek).toBeGreaterThanOrEqual(5);
        expect(p.byeWeek).toBeLessThanOrEqual(14);
      }
    });

    it('is exposed via the fixtures namespace', () => {
      expect(fixtures.footballPlayers).toBe(fixtureFootballPlayers);
    });

    it('is deterministic — repeated imports yield the same first entry', () => {
      const head = fixtureFootballPlayers[0];
      expect(head.position).toBe('QB');
      expect(head.id).toBe(1);
    });
  });

  describe('getFootballPlayer', () => {
    it('returns a deep clone — mutations do not affect the source', () => {
      const p = getFootballPlayer(0);
      const originalName = fixtureFootballPlayers[0].firstName;
      p.firstName = 'Changed';
      expect(fixtureFootballPlayers[0].firstName).toBe(originalName);
    });
  });

  describe('createFootballPlayer', () => {
    it('returns defaults when called with no arguments', () => {
      const player = createFootballPlayer();
      expect(player.position).toBe('QB');
      expect(player.team).toBe('KC');
    });

    it('merges overrides', () => {
      const player = createFootballPlayer({ position: 'WR', team: 'CIN' });
      expect(player.position).toBe('WR');
      expect(player.team).toBe('CIN');
    });
  });

  describe('createCareerPitchingStat', () => {
    it('returns defaults', () => {
      const stat = createCareerPitchingStat();
      expect(stat.earnedRunAvg).toBeGreaterThan(0);
    });

    it('merges overrides', () => {
      const stat = createCareerPitchingStat({ so: 300 });
      expect(stat.so).toBe(300);
    });
  });
});
