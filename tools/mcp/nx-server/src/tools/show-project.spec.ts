import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));

import { showProject } from './show-project.js';
import { runNx } from '../run-command.js';

const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;

function textOf(result: Awaited<ReturnType<typeof showProject>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('showProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a scoped project name (LS-10119)', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify({
        root: 'lib/video',
        sourceRoot: 'lib/video/src',
        projectType: 'library',
        tags: [],
        targets: {},
      }),
    );

    const result = await showProject({ project: '@legacy-sports/video' });

    expect(result.isError).toBeUndefined();
    expect(mockRunNx).toHaveBeenCalledWith(
      ['show', 'project', '@legacy-sports/video', '--json'],
      '/repo',
    );
    expect(textOf(result)).toContain('"project":"@legacy-sports/video"');
  });

  it('rejects an invalid project name without spawning nx', async () => {
    const result = await showProject({ project: 'video; rm -rf /' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Invalid project name/);
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});
