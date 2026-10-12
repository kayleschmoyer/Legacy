#!/usr/bin/env node
// Orchestrator: creates a scratch league owned by `owner`, joins `outsider`
// as an ordinary team manager, then runs every scenario module under
// scenarios/ (or just the ones named on argv) against them, as a hostile
// user would — through the live GraphQL API, not by reading source.
//
// A scenario's `exploited: true` is filed-worthy by construction: it means
// an actual live mutation/query succeeded that the authorization model says
// should have been refused. Read scenarios/*.mjs for exactly what each one
// proves, and SKILL.md ("When a scenario finds something") for what to do
// with a positive result.

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertLocalTarget } from './lib/stack.mjs';
import { gql, gqlRace, PERSONAS } from './lib/gql-client.mjs';

assertLocalTarget();

const scenariosDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'scenarios',
);
const requested = process.argv.slice(2);

async function setupFixture() {
  const create = await gql(
    'owner',
    `mutation($i:CreateLeagueAndTeamsInput!){
      createLeagueAndTeams(input:$i){ league{ id name inviteCode owner } teams{ id name } }
    }`,
    {
      i: {
        leagueName: `adversarial-qa ${Date.now()}`,
        numberOfTeams: 2,
        playerPool: 'all',
        sport: 'baseball',
        idempotencyKey: `aqa-${Date.now()}`,
      },
    },
  );
  const payload = create.data?.createLeagueAndTeams;
  if (!payload) {
    throw new Error(
      `Fixture setup failed: ${JSON.stringify(create.errors ?? create)}`,
    );
  }
  const league = payload.league;
  const ownerTeamId = payload.teams[0].id;

  const join = await gql(
    'outsider',
    `mutation($c:String!,$n:String!){ joinLeagueByCode(inviteCode:$c, teamName:$n){ id name } }`,
    { c: league.inviteCode, n: 'Outsider Team' },
  );
  const outsiderTeamId = join.data?.joinLeagueByCode?.id;
  if (!outsiderTeamId) {
    throw new Error(
      `outsider failed to join fixture league: ${JSON.stringify(join.errors ?? join)}`,
    );
  }

  return {
    league,
    teams: { owner: ownerTeamId, outsider: outsiderTeamId },
    playerId: 33,
  };
}

async function main() {
  console.log('==> Setting up scratch fixture (league + 2 teams)');
  const fixture = await setupFixture();
  console.log(
    `    league ${fixture.league.id}, owner team ${fixture.teams.owner}, outsider team ${fixture.teams.outsider}`,
  );

  const files = readdirSync(scenariosDir)
    .filter((f) => f.endsWith('.mjs'))
    .filter(
      (f) =>
        requested.length === 0 || requested.includes(f.replace(/\.mjs$/, '')),
    );

  const results = [];
  for (const file of files) {
    const mod = await import(path.join(scenariosDir, file));
    try {
      const outcome = await mod.run({ gql, gqlRace, PERSONAS, ...fixture });
      results.push({
        file,
        title: mod.title,
        severity: mod.severity,
        ...outcome,
      });
    } catch (err) {
      results.push({
        file,
        title: mod.title,
        severity: mod.severity,
        exploited: null,
        detail: `scenario threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  console.log('\n==> Results\n');
  for (const r of results) {
    const verdict =
      r.exploited === true
        ? '🔴 EXPLOITED'
        : r.exploited === false
          ? '🟢 blocked'
          : '⚠️  ERROR';
    console.log(`${verdict}  [${r.severity}] ${r.title}`);
    console.log(`         ${r.detail}\n`);
  }

  const exploitedCount = results.filter((r) => r.exploited === true).length;
  console.log(
    `${results.length} scenario(s) run, ${exploitedCount} live exploit(s) confirmed.`,
  );
  process.exitCode = exploitedCount > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
