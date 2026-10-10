/**
 * Tests for test-shard-partition.mjs (LS-11028) — the workspace-wide split of
 * typecheck + unit-test projects across ci-pipeline.yml's `test` matrix.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  partitionProjects,
  projectsForShard,
  sourceWeights,
} from '../test-shard-partition.mjs';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const fs = require('node:fs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE = path.resolve(
  __dirname,
  '..',
  '..',
  'workflows',
  'ci-pipeline.yml',
);

describe('sourceWeights', () => {
  it('counts only source files, attributing each to the longest containing root', () => {
    const weights = sourceWeights(
      [
        { name: 'web', root: 'apps/web' },
        { name: 'web-e2e', root: 'apps/web-e2e' },
        { name: 'nested', root: 'apps/web/nested' },
      ],
      [
        'apps/web/a.ts',
        'apps/web/b.tsx',
        'apps/web/readme.md',
        'apps/web/nested/c.ts',
        'apps/web-e2e/d.spec.ts',
        'apps/web-e2e/e.mjs',
        'lib/other/f.ts',
      ],
    );
    assert.deepEqual(Object.fromEntries(weights), {
      web: 2,
      'web-e2e': 2,
      nested: 1,
    });
  });

  it('floors an empty project at weight 1', () => {
    const weights = sourceWeights(
      [{ name: 'empty', root: 'lib/empty' }],
      ['lib/x/a.ts'],
    );
    assert.equal(weights.get('empty'), 1);
  });
});

describe('partitionProjects', () => {
  const projects = [
    { name: 'a', weight: 10 },
    { name: 'b', weight: 7 },
    { name: 'c', weight: 5 },
    { name: 'd', weight: 4 },
    { name: 'e', weight: 2 },
    { name: 'f', weight: 2 },
  ];

  it('assigns every project to exactly one shard', () => {
    const shards = partitionProjects(projects, 3);
    const all = shards.flatMap((s) => s.projects).sort();
    assert.deepEqual(all, ['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('places heaviest-first onto the lightest shard (greedy LPT)', () => {
    // a→1; b→2; c→3; d→3 (9); e→2 (9); shards are now 10/9/9, so f breaks
    // the tie to the lowest index → shard 2 → 10/11/9. LPT is a heuristic,
    // not an optimal partition (10/10/10 exists).
    const shards = partitionProjects(projects, 3);
    assert.deepEqual(
      shards.map((s) => s.projects),
      [['a'], ['b', 'e', 'f'], ['c', 'd']],
    );
    assert.deepEqual(
      shards.map((s) => s.weight),
      [10, 11, 9],
    );
  });

  it('is deterministic regardless of input order', () => {
    const forward = partitionProjects(projects, 4);
    const reversed = partitionProjects([...projects].reverse(), 4);
    assert.deepEqual(forward, reversed);
  });

  it('supports more shards than projects (extra shards are empty)', () => {
    const shards = partitionProjects([{ name: 'only', weight: 3 }], 3);
    assert.deepEqual(
      shards.map((s) => s.projects),
      [['only'], [], []],
    );
  });

  it('rejects a non-positive shard count', () => {
    assert.throws(() => partitionProjects(projects, 0), /positive integer/);
  });
});

describe('projectsForShard', () => {
  const shards = partitionProjects(
    [
      { name: 'a', weight: 10 },
      { name: 'b', weight: 9 },
      { name: 'c', weight: 1 },
    ],
    2,
  );

  it('intersects the shard assignment with the affected set', () => {
    // a → shard 1; b, c → shard 2.
    assert.deepEqual(projectsForShard(shards, 1, ['c', 'a']), ['a']);
    assert.deepEqual(projectsForShard(shards, 2, ['c', 'a']), ['c']);
  });

  it('ignores affected projects with no typecheck/test target', () => {
    assert.deepEqual(projectsForShard(shards, 1, ['no-targets']), []);
  });

  it('never drops a project when shards see different affected sets', () => {
    // Shard 1 and shard 2 computed affected against different bases; each
    // project is still owned by exactly one shard, so the union is covered.
    const run = [
      ...projectsForShard(shards, 1, ['a', 'b']),
      ...projectsForShard(shards, 2, ['a', 'b', 'c']),
    ].sort();
    assert.deepEqual(run, ['a', 'b', 'c']);
  });

  it('rejects an out-of-range shard', () => {
    assert.throws(() => projectsForShard(shards, 3, []), /out of range/);
  });
});

describe('ci-pipeline.yml test matrix (drift guard)', () => {
  const job = yaml.load(fs.readFileSync(PIPELINE, 'utf8')).jobs.test;
  const step = job.steps.find((s) => s.name === 'Typecheck & Test');

  it('keeps the job id `test` as the matrix itself (needs.test.result rollup)', () => {
    assert.ok(
      job.strategy?.matrix?.shard,
      'jobs.test must be the shard matrix',
    );
  });

  it('SHARD_TOTAL and the job name match the matrix size', () => {
    const shards = job.strategy.matrix.shard;
    assert.deepEqual(
      shards,
      Array.from({ length: shards.length }, (_, i) => i + 1),
    );
    assert.equal(String(step.env.SHARD_TOTAL), String(shards.length));
    assert.equal(
      job.name,
      `test (shard \${{ matrix.shard }}/${shards.length})`,
    );
  });
});
