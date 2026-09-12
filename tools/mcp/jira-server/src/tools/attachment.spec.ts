import {
  type AttachmentMeta,
  fetchAttachments,
  resolveAttachment,
  viewAttachment,
} from './attachment';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
  jiraRequestBinary: jest.fn(),
}));

const {
  jiraRequest: mockJiraRequest,
  jiraRequestBinary: mockJiraRequestBinary,
} = jest.requireMock<{
  jiraRequest: jest.Mock;
  jiraRequestBinary: jest.Mock;
}>('../jira-api');

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

function issueWithAttachments(
  attachment: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return { fields: { attachment } };
}

const screenshot = {
  id: 10501,
  filename: 'screenshot.png',
  mimeType: 'image/png',
  size: 2048,
  created: '2026-09-01T10:00:00.000Z',
  author: { displayName: 'Reporter Person' },
};

const logFile = {
  id: 10502,
  filename: 'console.log',
  mimeType: 'text/plain',
  size: 12,
  created: '2026-09-02T10:00:00.000Z',
  author: { displayName: 'Reporter Person' },
};

function textBlocks(result: { content: Array<{ type: string }> }): string[] {
  return result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text);
}

function imageBlock(result: { content: Array<{ type: string }> }) {
  return result.content.find(
    (c): c is { type: 'image'; data: string; mimeType: string } =>
      c.type === 'image',
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchAttachments', () => {
  it('requests only the attachment field and normalizes the records', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([screenshot]));

    const result = await fetchAttachments('LS-9784');

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/rest/api/3/issue/LS-9784',
      query: { fields: 'attachment' },
    });
    expect(result).toEqual([
      {
        id: '10501',
        filename: 'screenshot.png',
        mimeType: 'image/png',
        size: 2048,
        created: '2026-09-01T10:00:00.000Z',
        author: 'Reporter Person',
      },
    ]);
  });

  it('returns an empty list when the issue has no attachments', async () => {
    mockJiraRequest.mockResolvedValueOnce({ fields: {} });

    expect(await fetchAttachments('LS-1')).toEqual([]);
  });

  it('defaults missing mimeType and size', async () => {
    mockJiraRequest.mockResolvedValueOnce(
      issueWithAttachments([
        { id: 7, filename: 'blob', created: '2026-09-01T00:00:00.000Z' },
      ]),
    );

    expect(await fetchAttachments('LS-1')).toEqual([
      {
        id: '7',
        filename: 'blob',
        mimeType: 'application/octet-stream',
        size: 0,
        created: '2026-09-01T00:00:00.000Z',
        author: '',
      },
    ]);
  });
});

describe('resolveAttachment', () => {
  const list: AttachmentMeta[] = [
    {
      id: '1',
      filename: 'first.png',
      mimeType: 'image/png',
      size: 1,
      created: '2026-09-01T00:00:00.000Z',
      author: 'A',
    },
    {
      id: '2',
      filename: 'Second.PNG',
      mimeType: 'image/png',
      size: 1,
      created: '2026-09-03T00:00:00.000Z',
      author: 'A',
    },
  ];

  it('matches by id', () => {
    expect(resolveAttachment(list, '2')?.filename).toBe('Second.PNG');
  });

  it('matches by exact filename', () => {
    expect(resolveAttachment(list, 'first.png')?.id).toBe('1');
  });

  it('matches filenames case-insensitively as a fallback', () => {
    expect(resolveAttachment(list, 'second.png')?.id).toBe('2');
  });

  it('resolves "latest" to the most recently created attachment', () => {
    expect(resolveAttachment(list, 'latest')?.id).toBe('2');
  });

  it('returns undefined for no match and for an empty list', () => {
    expect(resolveAttachment(list, 'nope.png')).toBeUndefined();
    expect(resolveAttachment([], 'latest')).toBeUndefined();
  });
});

describe('viewAttachment', () => {
  it('returns an image content block for a screenshot', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([screenshot]));
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: PNG_BYTES,
      contentType: 'image/png',
    });

    const result = await viewAttachment('LS-9784', 'latest');

    expect(result.isError).toBeUndefined();
    expect(mockJiraRequestBinary).toHaveBeenCalledWith(
      '/rest/api/3/attachment/content/10501',
    );
    const image = imageBlock(result);
    expect(image?.mimeType).toBe('image/png');
    expect(image?.data).toBe(Buffer.from(PNG_BYTES).toString('base64'));
    const meta = JSON.parse(textBlocks(result)[0]) as Record<string, unknown>;
    expect(meta).toMatchObject({
      key: 'LS-9784',
      id: '10501',
      filename: 'screenshot.png',
      mimeType: 'image/png',
    });
  });

  it('falls back to the thumbnail endpoint for oversize images', async () => {
    mockJiraRequest.mockResolvedValueOnce(
      issueWithAttachments([{ ...screenshot, size: 9_000_000 }]),
    );
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: PNG_BYTES,
      contentType: 'image/jpeg',
    });

    const result = await viewAttachment('LS-9784', '10501');

    expect(mockJiraRequestBinary).toHaveBeenCalledWith(
      '/rest/api/3/attachment/thumbnail/10501',
    );
    const meta = JSON.parse(textBlocks(result)[0]) as { thumbnail?: boolean };
    expect(meta.thumbnail).toBe(true);
    // The thumbnail's own content type wins over the original's.
    expect(imageBlock(result)?.mimeType).toBe('image/jpeg');
  });

  it('errors when even the returned image exceeds the inline limit', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([screenshot]));
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: new Uint8Array(5 * 1024 * 1024),
      contentType: 'image/png',
    });

    const result = await viewAttachment('LS-9784', '10501');

    expect(result.isError).toBe(true);
    expect(imageBlock(result)).toBeUndefined();
    expect(textBlocks(result)[0]).toContain('inline limit');
  });

  it('decodes text attachments', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([logFile]));
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: new Uint8Array(Buffer.from('boom at line 3', 'utf8')),
      contentType: 'text/plain',
    });

    const result = await viewAttachment('LS-9784', 'console.log');

    expect(result.isError).toBeUndefined();
    expect(textBlocks(result)[1]).toBe('boom at line 3');
    expect(
      (JSON.parse(textBlocks(result)[0]) as { truncated: boolean }).truncated,
    ).toBe(false);
  });

  it('truncates long text attachments', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([logFile]));
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: new Uint8Array(Buffer.from('x'.repeat(25_000), 'utf8')),
      contentType: 'text/plain',
    });

    const result = await viewAttachment('LS-9784', 'console.log');

    const body = textBlocks(result)[1];
    expect(body.endsWith('… (truncated)')).toBe(true);
    expect(body.length).toBeLessThan(25_000);
    expect(
      (JSON.parse(textBlocks(result)[0]) as { truncated: boolean }).truncated,
    ).toBe(true);
  });

  it('refuses to inline a binary type it cannot render', async () => {
    mockJiraRequest.mockResolvedValueOnce(
      issueWithAttachments([
        { ...screenshot, filename: 'dump.zip', mimeType: 'application/zip' },
      ]),
    );
    mockJiraRequestBinary.mockResolvedValueOnce({
      bytes: PNG_BYTES,
      contentType: 'application/zip',
    });

    const result = await viewAttachment('LS-9784', 'dump.zip');

    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0]).toContain('application/zip');
  });

  it('lists the available attachments when the selector matches nothing', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([screenshot]));

    const result = await viewAttachment('LS-9784', 'missing.png');

    expect(result.isError).toBe(true);
    expect(mockJiraRequestBinary).not.toHaveBeenCalled();
    expect(textBlocks(result)[0]).toContain('screenshot.png');
  });

  it('reports an issue with no attachments without downloading', async () => {
    mockJiraRequest.mockResolvedValueOnce({ fields: { attachment: [] } });

    const result = await viewAttachment('LS-1', 'latest');

    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0]).toBe('LS-1 has no attachments.');
    expect(mockJiraRequestBinary).not.toHaveBeenCalled();
  });

  it('surfaces a metadata fetch failure as a tool error', async () => {
    mockJiraRequest.mockRejectedValueOnce(new Error('404 not found'));

    const result = await viewAttachment('LS-404', 'latest');

    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0]).toContain('404 not found');
  });

  it('surfaces a download failure as a tool error', async () => {
    mockJiraRequest.mockResolvedValueOnce(issueWithAttachments([screenshot]));
    mockJiraRequestBinary.mockRejectedValueOnce(new Error('403 forbidden'));

    const result = await viewAttachment('LS-9784', 'latest');

    expect(result.isError).toBe(true);
    expect(textBlocks(result)[0]).toContain('403 forbidden');
  });
});
