import { describe, expect, it, jest } from '@jest/globals';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  unlink: jest.fn(),
}));
jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));

import { readFile, unlink } from 'node:fs/promises';
import { depGraph } from './dep-graph.js';
import { runNx } from '../run-command.js';

const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;

function textOf(result: Awaited<ReturnType<typeof depGraph>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('depGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunNx.mockResolvedValue('');
    mockUnlink.mockResolvedValue(undefined);
  });

  it('accepts a scoped project name (LS-10119)', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        graph: {
          nodes: { '@legacy-sports/video': {} },
          dependencies: { '@legacy-sports/video': [{ target: 'db' }] },
        },
      }),
    );

    const result = await depGraph({ project: '@legacy-sports/video' });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('@legacy-sports/video');
  });

  it('rejects an invalid project name without spawning nx', async () => {
    const result = await depGraph({ project: 'video; rm -rf /' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid project name/);
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});
