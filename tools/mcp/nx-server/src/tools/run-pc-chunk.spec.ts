import { describe, expect, it, jest } from '@jest/globals';

// run-command.ts uses import.meta, which the CJS jest build cannot compile —
// mock it out the same way run-target.spec.ts does.
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
}));

import {
  getSuccessMarkerForChunk,
  getTimeoutForChunk,
  PC_CHUNKS,
  runPcChunk,
} from './run-pc-chunk.js';
import type { PcChunk } from './run-pc-chunk.js';

const HEAVY_CHUNKS: PcChunk[] = ['pc-lint', 'pc-test'];
const LIGHT_CHUNKS = PC_CHUNKS.filter((chunk) => !HEAVY_CHUNKS.includes(chunk));

describe('getTimeoutForChunk', () => {
  it('gives pc-lint and pc-test a longer timeout than every other chunk', () => {
    for (const heavy of HEAVY_CHUNKS) {
      for (const light of LIGHT_CHUNKS) {
        expect(getTimeoutForChunk(heavy)).toBeGreaterThan(
          getTimeoutForChunk(light),
        );
      }
    }
  });

  it('uses one shared default for the five non-heavy chunks', () => {
    const timeouts = new Set(LIGHT_CHUNKS.map(getTimeoutForChunk));
    expect(timeouts.size).toBe(1);
  });
});

describe('getSuccessMarkerForChunk', () => {
  it('matches the real nx success line for pc-lint', () => {
    const marker = getSuccessMarkerForChunk('pc-lint');
    expect(marker).toBeDefined();
    expect(
      marker?.test('NX   Successfully ran target lint for 30 projects'),
    ).toBe(true);
  });

  it('matches the real nx success line for pc-test', () => {
    const marker = getSuccessMarkerForChunk('pc-test');
    expect(marker).toBeDefined();
    expect(
      marker?.test(
        'NX   Successfully ran target test for 40 projects and 2 tasks they depend on',
      ),
    ).toBe(true);
  });

  it("does not accept the other heavy chunk's success line", () => {
    expect(
      getSuccessMarkerForChunk('pc-lint')?.test(
        'NX   Successfully ran target test for 40 projects',
      ),
    ).toBe(false);
    expect(
      getSuccessMarkerForChunk('pc-test')?.test(
        'NX   Successfully ran target lint for 30 projects',
      ),
    ).toBe(false);
  });

  it('returns undefined for multi-step chunks so partial success lines cannot mask a later hang', () => {
    for (const chunk of LIGHT_CHUNKS) {
      expect(getSuccessMarkerForChunk(chunk)).toBeUndefined();
    }
  });
});

describe('runPcChunk — maxWorkers validation (LS-8666)', () => {
  it('rejects a non-positive maxWorkers before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-test', maxWorkers: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });

  it('rejects a non-integer maxWorkers before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-test', maxWorkers: 1.5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid maxWorkers');
  });
});

describe('runPcChunk — parallel validation (LS-9114)', () => {
  it('rejects a non-positive parallel before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-lint', parallel: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid parallel');
  });

  it('rejects a non-integer parallel before starting a job', async () => {
    const result = await runPcChunk({ chunk: 'pc-lint', parallel: 1.5 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid parallel');
  });
});
