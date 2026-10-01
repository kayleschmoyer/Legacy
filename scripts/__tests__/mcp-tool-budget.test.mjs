/**
 * Tests for scripts/mcp-api-reference/budget.mjs (LS-9704).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/mcp-tool-budget.test.mjs
 *
 * The budget is a RATCHET, not a cap: `--check` must fail both when a server
 * grows past its ceiling AND when it drops well below one without the ceiling
 * being lowered. The second direction is the one that keeps savings from being
 * silently re-spent, so it gets the same coverage as the first.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  budgetFromMeasurement,
  checkBudget,
  measureDefinitionTokens,
  tokenTolerance,
  updateSingleServerBudget,
} from '../mcp-api-reference/budget.mjs';

/** Minimal model in the shape `collect()` returns. */
function modelWith(servers) {
  return {
    serverCount: servers.length,
    toolCount: servers.reduce((n, s) => n + s.tools.length, 0),
    servers,
  };
}

const SAMPLE = modelWith([
  {
    id: 'srv-a',
    tools: [
      {
        name: 'a_one',
        description: 'Does the first thing.',
        inputs: { properties: { key: { type: 'string' } } },
      },
      { name: 'a_two', description: 'Does the second thing.', inputs: {} },
    ],
  },
  { id: 'srv-b', tools: [{ name: 'b_one', description: 'B.', inputs: {} }] },
]);

test('measures definition tokens per server and in total', () => {
  const measured = measureDefinitionTokens(SAMPLE);

  assert.equal(measured.toolCount, 3);
  assert.equal(measured.servers['srv-a'].tools, 2);
  assert.equal(measured.servers['srv-b'].tools, 1);

  // Non-trivial counts, and the total is the sum of the parts.
  assert.ok(measured.servers['srv-a'].tokens > 0);
  assert.equal(
    measured.total,
    measured.servers['srv-a'].tokens + measured.servers['srv-b'].tokens,
  );

  // The richer server costs more — description and schema both count.
  assert.ok(
    measured.servers['srv-a'].tokens > measured.servers['srv-b'].tokens,
  );
});

test('a budget seeded from the current measurement passes cleanly', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const { violations } = checkBudget(measured, budgetFromMeasurement(measured));
  assert.deepEqual(violations, []);
});

test('fails when tool count exceeds the ceiling', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.servers['srv-a'].tools = 1; // measured is 2

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /2 tools exceeds the ceiling of 1/);
  assert.match(violations[0], /`action` param/);
});

test('fails when definition tokens exceed the ceiling', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.servers['srv-a'].tokens = measured.servers['srv-a'].tokens - 1;

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /definition tokens exceeds the ceiling/);
});

test('fails when a saving is left un-ratcheted (tool count below ceiling)', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.servers['srv-a'].tools = 5; // a consolidation landed; ceiling not lowered

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /2 tools is below the ceiling of 5/);
  assert.match(violations[0], /Lower it to 2/);
});

test('fails when a token saving exceeds the tolerance band', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  const ceiling = measured.servers['srv-a'].tokens + 10_000;
  budget.servers['srv-a'].tokens = ceiling;

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /under the ceiling/);
  assert.match(violations[0], /spend the saving silently/);
});

test('tolerates a token saving inside the band, so routine edits need no budget commit', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  const actual = measured.servers['srv-a'].tokens;
  // Sit just inside the band for this ceiling.
  const ceiling = actual + tokenTolerance(actual + 200) - 1;
  budget.servers['srv-a'].tokens = ceiling;

  const { violations } = checkBudget(measured, budget);
  assert.deepEqual(violations, []);
});

test('tolerance is 2% of the ceiling with a 200-token floor', () => {
  assert.equal(tokenTolerance(1000), 200); // floor applies
  assert.equal(tokenTolerance(10_000), 200); // 2% == floor
  assert.equal(tokenTolerance(20_000), 400); // 2% exceeds floor
});

test('fails on a new server with no budget entry, and names the line to add', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  delete budget.servers['srv-b'];

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /srv-b: new server with no budget entry/);
  assert.match(violations[0], /"srv-b": \{ "tools": 1, "tokens": \d+ \}/);
});

test('fails on a stale budget entry for a server that no longer exists', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.servers['srv-gone'] = { tools: 4, tokens: 900 };

  const { violations } = checkBudget(measured, budget);
  assert.equal(violations.length, 1);
  assert.match(
    violations[0],
    /srv-gone: has a budget entry but no longer exists/,
  );
});

test('a seeded budget has no stored "total" — it is implied by the per-server ceilings', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  assert.equal(budget.total, undefined);
});

test('updateSingleServerBudget raises only the named server', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  const originalB = { ...budget.servers['srv-b'] };

  // Simulate srv-a growing past its committed ceiling (tool count unchanged).
  budget.servers['srv-a'].tokens = measured.servers['srv-a'].tokens - 50;

  const updated = updateSingleServerBudget(measured, budget, 'srv-a');

  assert.deepEqual(updated.servers['srv-a'], {
    tools: measured.servers['srv-a'].tools,
    tokens: measured.servers['srv-a'].tokens,
  });
  // srv-b's ceiling is untouched.
  assert.deepEqual(updated.servers['srv-b'], originalB);
  // no "total" key is introduced — it stays implied by the per-server ceilings.
  assert.equal(updated.total, undefined);

  const { violations } = checkBudget(measured, updated);
  assert.deepEqual(violations, []);
});

test('updateSingleServerBudget throws for a server absent from the measurement', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);

  assert.throws(
    () => updateSingleServerBudget(measured, budget, 'srv-nonexistent'),
    /srv-nonexistent: not found in the current measurement/,
  );
});

test('reports per-server headroom on every run, passing or failing', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const { lines } = checkBudget(measured, budgetFromMeasurement(measured));

  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.includes('headroom')));
  assert.ok(lines.some((l) => l.includes('srv-a')));
});

// LS-10149: a `base` measurement (from `--baseRef`) lets a TOTAL violation say
// whether the base ref or this branch owns the overage, instead of always
// pointing at the branch.
test('TOTAL violation attributes the overage to an already-over-ceiling base, not the branch', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.total = { tokens: measured.total - 50 }; // ceiling sits below both base and branch

  const base = {
    ref: 'origin/main',
    // Base measured identically to this branch — this branch added nothing.
    measured: { total: measured.total, servers: measured.servers },
  };

  const { violations } = checkBudget(measured, budget, base);
  const totalLine = violations.find((v) => v.startsWith('TOTAL: '));
  assert.ok(totalLine, 'expected a TOTAL violation line');
  assert.match(totalLine, /base origin\/main: \d+, this branch: 0/);
  assert.match(totalLine, /base is already \+50 OVER/);
});

test('TOTAL violation attributes the overage to this branch when base is under ceiling', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  const baseTotal = measured.total - 10; // base sits comfortably under ceiling
  budget.total = { tokens: baseTotal + 2 }; // branch's +10 pushes total 8 over

  const base = {
    ref: 'origin/main',
    measured: { total: baseTotal, servers: {} },
  };

  const { violations } = checkBudget(measured, budget, base);
  const totalLine = violations.find((v) => v.startsWith('TOTAL: '));
  assert.ok(totalLine, 'expected a TOTAL violation line');
  assert.match(totalLine, /this branch: \+10/);
  assert.match(
    totalLine,
    /this branch added \+10, pushing TOTAL \+8 over the ceiling/,
  );
});

test('TOTAL violation falls back to the unattributed message when no base is given', () => {
  const measured = measureDefinitionTokens(SAMPLE);
  const budget = budgetFromMeasurement(measured);
  budget.total = { tokens: measured.total - 1 };

  const { violations } = checkBudget(measured, budget);
  const totalLine = violations.find((v) => v.startsWith('TOTAL: '));
  assert.match(totalLine, /definition tokens exceeds the ceiling of/);
  assert.ok(!totalLine.includes('base '));
});
