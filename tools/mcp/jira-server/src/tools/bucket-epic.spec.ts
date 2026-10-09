import { getBucketEpic, setBucketEpic } from './bucket-epic';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJql: jest.fn(),
}));

const { searchJql: mockSearchJql } = jest.requireMock<{
  searchJql: jest.Mock;
}>('../jql-search');

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

function parseJson(result: { content: Array<{ type: string }> }) {
  return JSON.parse(text(result)) as Record<string, unknown>;
}

describe('bucket-epic (design-sync bucket)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchJql.mockResolvedValue({ issues: [] });
  });

  it('getBucketEpic resolves the design-sync bucket from its own project property', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      value: { key: 'LS-4568', updatedAt: '2026-08-03T00:00:00.000Z' },
    });

    const result = await getBucketEpic({ bucket: 'design-sync' });

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/rest/api/3/project/LS/properties/bucket.design-sync',
    });
    expect(parseJson(result)).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'design-sync',
        key: 'LS-4568',
      }),
    );
  });

  it('setBucketEpic writes the design-sync bucket to its own project property', async () => {
    mockJiraRequest.mockResolvedValueOnce({});

    const result = await setBucketEpic({
      bucket: 'design-sync',
      epicKey: 'LS-4568',
    });

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/project/LS/properties/bucket.design-sync',
      body: expect.objectContaining({ key: 'LS-4568' }) as { key: string },
    });
    expect(parseJson(result)).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'design-sync',
        key: 'LS-4568',
      }),
    );
  });

  it('getBucketEpic reports a clear error when the design-sync property is unset', async () => {
    mockJiraRequest.mockRejectedValueOnce(new Error('Not Found (404)'));

    const result = await getBucketEpic({ bucket: 'design-sync' });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain(
      'Failed to get bucket epic for \\"design-sync\\"',
    );
  });
});

describe('bucket-epic drift guard (LS-10240)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchJql.mockResolvedValue({ issues: [] });
  });

  it('warns when the property points at an older epic than the newest labelled one', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      value: { key: 'LS-2981', updatedAt: '2026-04-10T03:04:23Z' },
    });
    mockSearchJql.mockResolvedValueOnce({
      issues: [{ key: 'LS-10169' }, { key: 'LS-2981' }],
    });

    const body = parseJson(await getBucketEpic({ bucket: 'mcp-gaps' }));

    expect(mockSearchJql).toHaveBeenCalledWith(
      expect.objectContaining({
        jql: expect.stringContaining('labels = "bucket:mcp-gaps"') as string,
      }),
    );
    expect(body.key).toBe('LS-2981');
    expect(body.warning).toEqual(expect.stringContaining('LS-10169'));
  });

  it('warns when several open epics share the label even if the property is newest', async () => {
    mockJiraRequest.mockResolvedValueOnce({ value: { key: 'LS-20' } });
    mockSearchJql.mockResolvedValueOnce({
      issues: [{ key: 'LS-20' }, { key: 'LS-10' }],
    });

    const body = parseJson(await getBucketEpic({ bucket: 'client-bugs' }));

    expect(body.warning).toEqual(expect.stringContaining('2 open epics'));
  });

  it('omits the warning when the property matches the only open labelled epic', async () => {
    mockJiraRequest.mockResolvedValueOnce({ value: { key: 'LS-30' } });
    mockSearchJql.mockResolvedValueOnce({ issues: [{ key: 'LS-30' }] });

    const body = parseJson(await getBucketEpic({ bucket: 'drift-ok' }));

    expect(body).not.toHaveProperty('warning');
  });

  it('still resolves the key when the drift lookup fails', async () => {
    mockJiraRequest.mockResolvedValueOnce({ value: { key: 'LS-40' } });
    mockSearchJql.mockRejectedValueOnce(new Error('boom'));

    const body = parseJson(await getBucketEpic({ bucket: 'drift-fail' }));

    expect(body).toEqual(
      expect.objectContaining({ success: true, key: 'LS-40' }),
    );
    expect(body).not.toHaveProperty('warning');
  });
});
