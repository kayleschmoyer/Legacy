/**
 * Unit tests for the stack-rank ADP pool definition (LS-10096).
 *
 * The pool predicates are raw SQL fragments, so these assert on the rendered
 * SQL rather than on query results. That is deliberately a structural test:
 * the behaviour it guards was verified against the dev database, where a
 * completed 300-pick draft ranked 0/300 picks under the old predicate and
 * 300/300 under the current one. The invariant is narrow and easy to delete
 * by accident, so it gets pinned here where it is cheap to run.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { buildDraftAdpCte, buildDraftAdpPoolConditions } from './draft-adp';

const dialect = new PgDialect();

/** Render a fragment to SQL text with whitespace collapsed, for matching. */
const render = (fragment: Parameters<typeof dialect.sqlToQuery>[0]): string =>
  dialect.sqlToQuery(fragment).sql.replace(/\s+/g, ' ').trim();

const poolConditions = (overrides: { draftId?: number } = {}) =>
  buildDraftAdpPoolConditions({
    draftId: overrides.draftId ?? 77,
    leagueId: 42,
    leagueSport: 'baseball',
    league: {
      sport: 'baseball',
      playerPool: 'all',
      minCareerGames: 0,
      minCareerSeasons: 0,
      baseballHofOnly: false,
      baseballEraFilter: 'all',
      customEraStartYear: null,
      customEraEndYear: null,
      defensiveFormat: null,
    },
  });

describe('buildDraftAdpPoolConditions', () => {
  it('restricts the pool to the league sport', () => {
    const [sportCondition] = poolConditions();
    expect(render(sportCondition)).toContain('p.sport =');
  });

  it('excludes players rostered in the league', () => {
    const rendered = poolConditions().map(render).join(' ');
    expect(rendered).toContain('public.team_members');
    expect(rendered).toContain('NOT EXISTS');
  });

  it("keeps players rostered by this draft's own picks inside the ranking window", () => {
    // The bug this pins: a live pick rosters its player in the same
    // transaction that writes the draft_picks row. Without this carve-out
    // every pick is "rostered", so every pick falls out of the ranking window
    // and DraftPick.adp resolves to null for the entire board — verified
    // against a real 300-pick draft, which ranked 0 of 300.
    const rendered = poolConditions().map(render).join(' ');
    expect(rendered).toContain('public.draft_picks');
    expect(rendered).toMatch(/OR EXISTS/);
  });

  it('scopes the carve-out to this draft, not to drafted players generally', () => {
    // Scoping matters: a keeper rostered from a previous season, or a player
    // drafted in some *other* league's draft, must still be outside the
    // window. Only this draft's picks are readmitted.
    const [, rosterCondition] = poolConditions({ draftId: 77 });
    const query = dialect.sqlToQuery(rosterCondition);
    expect(query.sql.replace(/\s+/g, ' ')).toContain('dp.draft_id =');
    expect(query.params).toContain(77);
  });
});

describe('buildDraftAdpPoolConditions — defensive format (LS-10828)', () => {
  const footballPool = (defensiveFormat: string | null) =>
    buildDraftAdpPoolConditions({
      draftId: 77,
      leagueId: 42,
      leagueSport: 'football',
      league: {
        sport: 'football',
        playerPool: 'nfl',
        minCareerGames: null,
        minCareerSeasons: null,
        baseballHofOnly: null,
        baseballEraFilter: null,
        customEraStartYear: null,
        customEraEndYear: null,
        defensiveFormat,
      },
    })
      .map(render)
      .join(' ');

  it('keeps DL/LB/DB-only players out of a D/ST league pool', () => {
    // The board and both pick mutations share this pool, so a D/ST league
    // must neither list nor accept a player who can fill no slot in it.
    const rendered = footballPool('dst');
    expect(rendered).toContain('football_player_eligible_positions');
    expect(rendered).toContain("fpep.position IN ('DL', 'LB', 'DB')");
    expect(rendered).not.toContain('p.is_dst = FALSE');
  });

  it('reads a null format as D/ST', () => {
    expect(footballPool(null)).toContain("fpep.position IN ('DL', 'LB', 'DB')");
  });

  it('keeps team D/ST players out of an IDP league pool', () => {
    const rendered = footballPool('idp');
    expect(rendered).toContain('p.is_dst = FALSE');
    expect(rendered).not.toContain("fpep.position IN ('DL', 'LB', 'DB')");
  });
});

describe('buildDraftAdpCte', () => {
  it('ranks over the pool predicates it is given', () => {
    const cte = buildDraftAdpCte({
      leagueId: 42,
      leagueSport: 'baseball',
      poolConditions: poolConditions(),
    });
    const rendered = render(cte);
    expect(rendered).toContain('WITH draft_adp AS');
    expect(rendered).toContain('RANK() OVER');
    expect(rendered).toContain('public.team_members');
    expect(rendered).toContain('public.draft_picks');
  });

  it('reads the football scoring cache for football leagues (LS-9484)', () => {
    const baseball = render(
      buildDraftAdpCte({
        leagueId: 42,
        leagueSport: 'baseball',
        poolConditions: poolConditions(),
      }),
    );
    const football = render(
      buildDraftAdpCte({
        leagueId: 42,
        leagueSport: 'football',
        poolConditions: poolConditions(),
      }),
    );

    expect(baseball).toContain('public.player_scoring_cache');
    expect(baseball).not.toContain('football_player_scoring_cache');
    expect(football).toContain('public.football_player_scoring_cache');
  });
});
