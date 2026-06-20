import { bulkView } from './bulk-view';

jest.mock('./view', () => ({
  view: jest.fn(),
}));

const { view: mockView } = jest.requireMock('./view') as {
  view: jest.Mock;
};

function parseResult(result: { content: ReadonlyArray<unknown> }): {
  success: boolean;
  total: number;
  succeeded: Array<{ key: string; format: string; ticket: unknown }>;
  failed: Array<{ key: string; error: string }>;
} {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bulkView', () => {
  it('parses per-ticket JSON when format is json (the default)', async () => {
    mockView.mockImplementation(async ({ key }: { key: string }) => ({
      content: [
        { type: 'text', text: JSON.stringify({ key, summary: `s-${key}` }) },
      ],
    }));

    const result = await bulkView({ keys: ['LS-1', 'LS-2'] });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.succeeded).toHaveLength(2);
    const t = parsed.succeeded[0].ticket as { key: string; summary: string };
    expect(t.summary).toBe('s-LS-1');
  });

  it('keeps the raw markdown text when format is markdown', async () => {
    mockView.mockResolvedValue({
      content: [{ type: 'text', text: '## [LS-1] title' }],
    });

    const result = await bulkView({ keys: ['LS-1'], format: 'markdown' });
    const parsed = parseResult(result);
    expect(parsed.succeeded[0].ticket).toBe('## [LS-1] title');
  });

  it('captures isError responses as failed entries', async () => {
    mockView.mockImplementation(async ({ key }: { key: string }) => {
      if (key === 'LS-2') {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Not found' }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ key }) }],
      };
    });

    const result = await bulkView({ keys: ['LS-1', 'LS-2'] });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.succeeded.map((s) => s.key)).toEqual(['LS-1']);
    expect(parsed.failed).toEqual([{ key: 'LS-2', error: 'Not found' }]);
  });

  it('caps at 50 keys per call', async () => {
    const keys = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);
    const result = await bulkView({ keys });
    expect(result.isError).toBe(true);
    expect(mockView).not.toHaveBeenCalled();
  });
});
