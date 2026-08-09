import { getBucketEpic, setBucketEpic } from './bucket-epic';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

function parseJson(result: { content: Array<{ type: string }> }) {
  return JSON.parse(text(result)) as Record<string, unknown>;
}

describe('bucket-epic (design-sync bucket)', () => {
  beforeEach(() => jest.clearAllMocks());

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
      body: expect.objectContaining({ key: 'LS-4568' }),
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
