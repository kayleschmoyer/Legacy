import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));

import { showProjects } from './show-projects.js';
import { runNx } from '../run-command.js';

const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;

function textOf(result: Awaited<ReturnType<typeof showProjects>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('showProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses the current Nx CLI single-line JSON-array output', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify(['mcp-ci-server', 'shared-components', 'db']),
    );

    const result = await showProjects({});

    const text = textOf(result);
    expect(text).toContain('"count":3');
    expect(text.split('\n').slice(1)).toEqual([
      'mcp-ci-server',
      'shared-components',
      'db',
    ]);
  });

  it('falls back to newline-separated parsing for older Nx versions', async () => {
    mockRunNx.mockResolvedValue('mcp-ci-server\nshared-components\ndb\n');

    const result = await showProjects({});

    const text = textOf(result);
    expect(text).toContain('"count":3');
    expect(text.split('\n').slice(1)).toEqual([
      'mcp-ci-server',
      'shared-components',
      'db',
    ]);
  });

  it('passes --affected, --tag, and --with-target through to nx and reflects them in the summary', async () => {
    mockRunNx.mockResolvedValue(JSON.stringify(['db']));

    const result = await showProjects({
      affected: true,
      tag: 'scope:db',
      withTarget: 'test',
    });

    expect(mockRunNx).toHaveBeenCalledWith(
      [
        'show',
        'projects',
        '--affected',
        '--with-target=test',
        '--tag=scope:db',
      ],
      '/repo',
    );
    const text = textOf(result);
    expect(text).toContain('"mode":"affected"');
    expect(text).toContain('"filteredByTarget":"test"');
    expect(text).toContain('"filteredByTag":"scope:db"');
    expect(text.split('\n').slice(1)).toEqual(['db']);
  });

  it('rejects an invalid withTarget without calling nx', async () => {
    const result = await showProjects({ withTarget: '$(rm -rf /)' });

    expect(result.isError).toBe(true);
    expect(mockRunNx).not.toHaveBeenCalled();
  });
});
