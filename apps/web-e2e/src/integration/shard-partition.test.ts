import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  listSpecFiles,
  loadWeights,
  partitionSpecs,
  shardSpecs,
  type ShardWeights,
} from './shard-partition';

const WEIGHTS_PATH = path.resolve(__dirname, 'integration-shard-weights.json');
const TESTS_DIR = path.resolve(__dirname, 'tests');

const sampleWeights: ShardWeights = {
  defaultWeightSeconds: 90,
  weights: {
    'live-draft-ui.integration.spec.ts': 1400,
    'mock-draft-simulator-ui.integration.spec.ts': 600,
    'full-season-ui.integration.spec.ts': 480,
    'matchup-detail-ui.integration.spec.ts': 360,
    'light-a.integration.spec.ts': 30,
    'light-b.integration.spec.ts': 30,
  },
};

const sampleSpecs = Object.keys(sampleWeights.weights);

void test('partitionSpecs assigns every spec exactly once (no drops, no dupes)', () => {
  const { bins } = partitionSpecs({
    specs: sampleSpecs,
    weights: sampleWeights,
    shards: 3,
  });
  const flattened = bins.flat().sort();
  assert.deepEqual(flattened, [...sampleSpecs].sort());
  // No spec appears in more than one bin.
  assert.equal(new Set(flattened).size, sampleSpecs.length);
});

void test('partitionSpecs is deterministic across repeated calls', () => {
  const first = partitionSpecs({
    specs: sampleSpecs,
    weights: sampleWeights,
    shards: 3,
  });
  const second = partitionSpecs({
    specs: [...sampleSpecs].reverse(), // input order must not matter
    weights: sampleWeights,
    shards: 3,
  });
  assert.deepEqual(first.bins, second.bins);
  assert.deepEqual(first.totals, second.totals);
});

void test('partitionSpecs isolates the heaviest spec and balances the rest', () => {
  const { bins, totals } = partitionSpecs({
    specs: sampleSpecs,
    weights: sampleWeights,
    shards: 3,
  });
  // The 1400s spec dominates; LPT must not pile another heavy spec on top of it.
  const heavyBin = bins.find((b) =>
    b.includes('live-draft-ui.integration.spec.ts'),
  );
  assert.ok(heavyBin);
  assert.ok(
    !heavyBin.includes('mock-draft-simulator-ui.integration.spec.ts'),
    'second-heaviest spec must not share the heaviest spec’s shard',
  );
  // Spread of bin totals stays bounded by the heaviest single weight (LPT
  // guarantee): max - min <= max single weight.
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  assert.ok(
    max - min <= 1400,
    `bin spread ${max - min} exceeded the max single weight`,
  );
});

void test('partitionSpecs falls back to defaultWeightSeconds for unmapped specs', () => {
  const specs = ['known.integration.spec.ts', 'unknown.integration.spec.ts'];
  const weights: ShardWeights = {
    defaultWeightSeconds: 50,
    weights: { 'known.integration.spec.ts': 10 },
  };
  const { bins, totals } = partitionSpecs({ specs, weights, shards: 2 });
  // The unmapped (heavier-by-default, 50s) spec is placed first, alone; the
  // lighter known spec lands in the other bin.
  const unknownBin = bins.findIndex((b) =>
    b.includes('unknown.integration.spec.ts'),
  );
  const knownBin = bins.findIndex((b) =>
    b.includes('known.integration.spec.ts'),
  );
  assert.notEqual(unknownBin, knownBin);
  assert.equal(totals[unknownBin], 50);
  assert.equal(totals[knownBin], 10);
});

void test('shardSpecs returns disjoint bins whose union is every spec', () => {
  const shards = 3;
  const union: string[] = [];
  for (let index = 1; index <= shards; index++) {
    union.push(
      ...shardSpecs({
        specs: sampleSpecs,
        weights: sampleWeights,
        shards,
        index,
      }),
    );
  }
  assert.deepEqual(union.sort(), [...sampleSpecs].sort());
});

void test('shardSpecs rejects out-of-range indices', () => {
  assert.throws(() =>
    shardSpecs({
      specs: sampleSpecs,
      weights: sampleWeights,
      shards: 3,
      index: 0,
    }),
  );
  assert.throws(() =>
    shardSpecs({
      specs: sampleSpecs,
      weights: sampleWeights,
      shards: 3,
      index: 4,
    }),
  );
});

void test('partitionSpecs rejects a non-positive shard count', () => {
  assert.throws(() =>
    partitionSpecs({ specs: sampleSpecs, weights: sampleWeights, shards: 0 }),
  );
});

// --- Integration with the real manifest + tests directory --------------------

void test('the committed weights manifest parses and has a numeric default', () => {
  const weights = loadWeights(WEIGHTS_PATH);
  assert.equal(typeof weights.defaultWeightSeconds, 'number');
  assert.ok(weights.defaultWeightSeconds > 0);
  assert.ok(Object.keys(weights.weights).length > 0);
});

void test('every real integration spec has an explicit weight entry', () => {
  // Keeps the manifest honest: a newly-added spec without a weight would
  // silently fall back to the default and could unbalance the shards.
  const weights = loadWeights(WEIGHTS_PATH);
  const specs = listSpecFiles(TESTS_DIR);
  const missing = specs.filter((s) => weights.weights[s] === undefined);
  assert.deepEqual(
    missing,
    [],
    `These integration specs are missing a weight in integration-shard-weights.json: ${missing.join(', ')}`,
  );
});

void test('weights manifest has no stale entries for deleted specs', () => {
  const weights = loadWeights(WEIGHTS_PATH);
  const specs = new Set(listSpecFiles(TESTS_DIR));
  const stale = Object.keys(weights.weights).filter((s) => !specs.has(s));
  assert.deepEqual(
    stale,
    [],
    `These weight entries reference specs that no longer exist: ${stale.join(', ')}`,
  );
});

void test('real manifest balances the live suite across 3 shards', () => {
  const weights = loadWeights(WEIGHTS_PATH);
  const specs = listSpecFiles(TESTS_DIR);
  const { totals } = partitionSpecs({ specs, weights, shards: 3 });
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const heaviest = Math.max(...Object.values(weights.weights));
  // LPT guarantee: spread bounded by the single heaviest spec.
  assert.ok(
    max - min <= heaviest,
    `shard spread ${max - min}s exceeded heaviest spec ${heaviest}s (totals: ${totals.join(', ')})`,
  );
});

// Sanity check that the fixture file path resolution used above is correct, so
// the manifest-coupled tests fail loudly (not silently skip) if the layout moves.
void test('weights manifest file exists at the expected path', () => {
  assert.ok(fs.existsSync(WEIGHTS_PATH));
  assert.ok(fs.existsSync(TESTS_DIR));
});
