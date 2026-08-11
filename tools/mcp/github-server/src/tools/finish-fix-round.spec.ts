import {
  buildReplyBody,
  finishFixRound,
  validateReplies,
} from './finish-fix-round';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

const { githubRest: mockRest, githubGraphQL: mockGraphQL } = jest.requireMock<{
  githubRest: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  githubGraphQL: jest.Mock<Promise<unknown>, [string, Record<string, unknown>]>;
}>('../github-api');
const { getRepoOwnerName: mockRepo } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');

interface ParsedResult {
  error?: string;
  replied?: number;
  resolved?: number;
  labelApplied?: boolean;
  errors?: Array<{ stage: string; threadId?: string }>;
  replies?: Array<{
    threadId?: string;
    issueId?: string;
    kind: string;
    body: string;
    success: boolean;
    commentId?: number;
  }>;
  resolutions?: Array<{ threadId: string; isResolved: boolean }>;
}

function parse(result: {
  content: Array<{ type: string; text: string }>;
}): ParsedResult {
  return JSON.parse(result.content[0].text) as ParsedResult;
}

describe('validateReplies', () => {
  it('rejects an empty array', () => {
    expect(validateReplies([])).toHaveLength(1);
  });

  it('rejects FIX without sha', () => {
    const errs = validateReplies([{ threadId: 'PRRT_1', kind: 'FIX' }]);
    expect(errs.some((e) => /sha/.test(e.message))).toBe(true);
  });

  it('rejects JUSTIFY without body', () => {
    const errs = validateReplies([{ threadId: 'PRRT_1', kind: 'JUSTIFY' }]);
    expect(errs.some((e) => /body/.test(e.message))).toBe(true);
  });

  it('rejects CANNOT-COMPLY without body', () => {
    const errs = validateReplies([
      { threadId: 'PRRT_1', kind: 'CANNOT-COMPLY' },
    ]);
    expect(errs.some((e) => /body/.test(e.message))).toBe(true);
  });

  it('rejects missing threadId and missing issueId', () => {
    const errs = validateReplies([
      { threadId: '', kind: 'FIX', sha: 'abc123' },
    ]);
    expect(errs.some((e) => /threadId.*issueId/.test(e.message))).toBe(true);
  });

  it('rejects both threadId and issueId provided together', () => {
    const errs = validateReplies([
      {
        threadId: 'PRRT_1',
        issueId: 'ISSUE01',
        kind: 'FIX',
        sha: 'abc123',
      },
    ]);
    expect(errs.some((e) => /threadId.*issueId/.test(e.message))).toBe(true);
  });

  it('accepts issueId (PR-level) in place of threadId', () => {
    expect(
      validateReplies([{ issueId: 'ISSUE01', kind: 'FIX', sha: 'abc1234' }]),
    ).toEqual([]);
  });

  it('accepts a well-formed mixed batch', () => {
    expect(
      validateReplies([
        { threadId: 'PRRT_1', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_2', kind: 'JUSTIFY', body: 'not a bug' },
        { threadId: 'PRRT_3', kind: 'CANNOT-COMPLY', body: 'LS-1\nreason' },
        { issueId: 'ISSUE01', kind: 'FIX', sha: 'def5678' },
        { issueId: 'ISSUE02', kind: 'JUSTIFY', body: 'out of scope' },
      ]),
    ).toEqual([]);
  });
});

describe('buildReplyBody', () => {
  it('emits exactly `FIX: <sha>` with no trailing prose', () => {
    expect(buildReplyBody({ threadId: 't', kind: 'FIX', sha: 'abc1234' })).toBe(
      'FIX: abc1234',
    );
  });

  it('trims sha before emitting', () => {
    expect(
      buildReplyBody({ threadId: 't', kind: 'FIX', sha: '  abc1234  ' }),
    ).toBe('FIX: abc1234');
  });

  it('prefixes JUSTIFY body when missing', () => {
    expect(
      buildReplyBody({ threadId: 't', kind: 'JUSTIFY', body: 'not a bug' }),
    ).toBe('JUSTIFY: not a bug');
  });

  it('does not double-prefix JUSTIFY when body already starts with prefix', () => {
    expect(
      buildReplyBody({
        threadId: 't',
        kind: 'JUSTIFY',
        body: 'JUSTIFY: not a bug',
      }),
    ).toBe('JUSTIFY: not a bug');
  });

  it('prefixes CANNOT-COMPLY body when missing', () => {
    expect(
      buildReplyBody({
        threadId: 't',
        kind: 'CANNOT-COMPLY',
        body: 'LS-1\nimpossible',
      }),
    ).toBe('CANNOT-COMPLY: LS-1\nimpossible');
  });

  it('PR-level FIX (issueId set, no threadId) puts the issue-id on its own line before the sha', () => {
    expect(
      buildReplyBody({ issueId: 'ISSUE01', kind: 'FIX', sha: 'abc1234' }),
    ).toBe('FIX: ISSUE01\nabc1234');
  });

  it('PR-level JUSTIFY (issueId set, no threadId) puts the issue-id on its own line before the rationale', () => {
    expect(
      buildReplyBody({
        issueId: 'ISSUE01',
        kind: 'JUSTIFY',
        body: 'Already covered by an existing test.',
      }),
    ).toBe('JUSTIFY: ISSUE01\nAlready covered by an existing test.');
  });

  it('PR-level CANNOT-COMPLY (issueId set, no threadId) puts the issue-id on its own line before the reason', () => {
    expect(
      buildReplyBody({
        issueId: 'ISSUE01',
        kind: 'CANNOT-COMPLY',
        body: 'Generated file, cannot modify.',
      }),
    ).toBe('CANNOT-COMPLY: ISSUE01\nGenerated file, cannot modify.');
  });
});

describe('finishFixRound (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.mockResolvedValue({ owner: 'bkrupa', name: 'legacy-sports' });
  });

  it('rejects invalid input before any side effect', async () => {
    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ threadId: 'PRRT_1', kind: 'FIX' }],
    });
    expect(result.isError).toBe(true);
    expect(mockGraphQL).not.toHaveBeenCalled();
    expect(mockRest).not.toHaveBeenCalled();
    const data = parse(result);
    expect(data.error).toMatch(/validation failed/);
  });

  it('replies, resolves FIX threads, and labels in one call', async () => {
    mockGraphQL.mockImplementation((query: string) => {
      if (query.includes('addPullRequestReviewThreadReply')) {
        return Promise.resolve({
          data: {
            addPullRequestReviewThreadReply: {
              comment: { id: 'RC_x', body: 'irrelevant' },
            },
          },
        });
      }
      // batch resolve
      return Promise.resolve({
        data: {
          t0: { thread: { isResolved: true } },
        },
      });
    });
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({}),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [
        { threadId: 'PRRT_1', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_2', kind: 'JUSTIFY', body: 'intentional' },
      ],
    });

    const data = parse(result);
    expect(data.replied).toBe(2);
    expect(data.resolved).toBe(1);
    expect(data.labelApplied).toBe(true);
    expect(data.labelReapplied).toBe(false);

    // FIX body is exactly `FIX: <sha>`
    const fixCall = mockGraphQL.mock.calls.find(
      ([, vars]) => (vars as { threadId: string }).threadId === 'PRRT_1',
    );
    if (!fixCall) throw new Error('fixCall not found');
    expect((fixCall[1] as { body: string }).body).toBe('FIX: abc1234');

    // JUSTIFY prefixed
    const justifyCall = mockGraphQL.mock.calls.find(
      ([, vars]) => (vars as { threadId: string }).threadId === 'PRRT_2',
    );
    if (!justifyCall) throw new Error('justifyCall not found');
    expect((justifyCall[1] as { body: string }).body).toBe(
      'JUSTIFY: intentional',
    );

    // Label POST
    expect(mockRest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/repos/bkrupa/legacy-sports/issues/42/labels',
      body: { labels: ['bot:ready-for-review'] },
    });

    // JUSTIFY threads must NOT be resolved
    const resolveCall = mockGraphQL.mock.calls.find(([q]) =>
      q.includes('resolveReviewThread'),
    );
    if (!resolveCall) throw new Error('resolveCall not found');
    const resolveVars = resolveCall[1] as Record<string, string>;
    expect(Object.values(resolveVars)).toContain('PRRT_1');
    expect(Object.values(resolveVars)).not.toContain('PRRT_2');
  });

  it('partial failure: failed reply does not block successful one or the label', async () => {
    let call = 0;
    mockGraphQL.mockImplementation((query: string) => {
      if (query.includes('addPullRequestReviewThreadReply')) {
        call += 1;
        if (call === 1) {
          return Promise.reject(new Error('thread locked'));
        }
        return Promise.resolve({
          data: {
            addPullRequestReviewThreadReply: {
              comment: { id: 'RC_ok', body: 'FIX: def5678' },
            },
          },
        });
      }
      return Promise.resolve({
        data: { t0: { thread: { isResolved: true } } },
      });
    });
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({}),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [
        { threadId: 'PRRT_FAIL', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_OK', kind: 'FIX', sha: 'def5678' },
      ],
    });

    const data = parse(result);
    expect(data.replied).toBe(1);
    expect(data.resolved).toBe(1);
    expect(data.labelApplied).toBe(true);
    expect(data.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'reply', threadId: 'PRRT_FAIL' }),
      ]),
    );

    // Failed thread is NOT resolved
    const resolveCall = mockGraphQL.mock.calls.find(([q]) =>
      q.includes('resolveReviewThread'),
    );
    if (!resolveCall) throw new Error('resolveCall not found');
    const resolveVars = resolveCall[1] as Record<string, string>;
    expect(Object.values(resolveVars)).not.toContain('PRRT_FAIL');
    expect(Object.values(resolveVars)).toContain('PRRT_OK');
  });

  it('skips resolve step when no FIX threads succeeded', async () => {
    mockGraphQL.mockResolvedValue({
      data: {
        addPullRequestReviewThreadReply: {
          comment: { id: 'RC_x', body: 'x' },
        },
      },
    });
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({}),
    );

    await finishFixRound({
      prNumber: 99,
      replies: [{ threadId: 'PRRT_J', kind: 'JUSTIFY', body: 'fine' }],
    });

    const resolveCall = mockGraphQL.mock.calls.find(([q]) =>
      q.includes('resolveReviewThread'),
    );
    expect(resolveCall).toBeUndefined();
  });

  it('posts a PR-level (issueId) reply as a top-level issue comment, not a thread reply', async () => {
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({ id: 555 }),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ issueId: 'ISSUE01', kind: 'FIX', sha: 'abc1234' }],
    });

    const data = parse(result);
    expect(data.replied).toBe(1);
    expect(data.replies[0]).toMatchObject({
      issueId: 'ISSUE01',
      kind: 'FIX',
      body: 'FIX: ISSUE01\nabc1234',
      success: true,
      commentId: 555,
    });
    expect(data.replies[0].threadId).toBeUndefined();

    // No GraphQL thread reply or resolve mutation — PR-level replies have no thread.
    expect(mockGraphQL).not.toHaveBeenCalled();

    // Posted as a plain issue comment via REST, distinct from the label POST.
    expect(mockRest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/repos/bkrupa/legacy-sports/issues/42/comments',
      body: { body: 'FIX: ISSUE01\nabc1234' },
    });
    expect(mockRest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/repos/bkrupa/legacy-sports/issues/42/labels',
      body: { labels: ['bot:ready-for-review'] },
    });
  });

  it('does not resolve anything for a PR-level FIX reply (no thread exists)', async () => {
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({ id: 555 }),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ issueId: 'ISSUE01', kind: 'FIX', sha: 'abc1234' }],
    });

    const data = parse(result);
    expect(data.resolved).toBe(0);
    expect(data.resolutions).toEqual([]);
  });

  it('forces a remove-then-add cycle when the ready label is already present (LS-8706)', async () => {
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET'
        ? Promise.resolve([{ name: 'bot:ready-for-review' }])
        : Promise.resolve({}),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ issueId: 'ISSUE01', kind: 'JUSTIFY', body: 'covered' }],
    });

    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
    expect(data.labelApplied).toBe(false);
    expect(data.labelReapplied).toBe(true);

    const labelPath = '/repos/bkrupa/legacy-sports/issues/42/labels';
    const deleteCall = mockRest.mock.calls.find(
      ([args]) =>
        args.method === 'DELETE' &&
        args.path === `${labelPath}/bot%3Aready-for-review`,
    );
    const postCall = mockRest.mock.calls.find(
      ([args]) => args.method === 'POST' && args.path === labelPath,
    );
    expect(deleteCall).toBeDefined();
    expect(postCall).toBeDefined();
    // Remove must happen before the re-add.
    expect(mockRest.mock.calls.indexOf(deleteCall!)).toBeLessThan(
      mockRest.mock.calls.indexOf(postCall!),
    );
  });

  it('does a plain add (no delete) when the ready label is not yet present', async () => {
    mockRest.mockImplementation(({ method }: { method: string }) =>
      method === 'GET' ? Promise.resolve([]) : Promise.resolve({}),
    );

    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ issueId: 'ISSUE01', kind: 'JUSTIFY', body: 'covered' }],
    });

    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
    expect(data.labelApplied).toBe(true);
    expect(data.labelReapplied).toBe(false);

    const deleteCalls = mockRest.mock.calls.filter(
      ([args]) => args.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('still adds the label when the remove-then-add DELETE 404s (label removed by a racing call)', async () => {
    mockRest.mockImplementation(({ method }: { method: string }) => {
      if (method === 'GET')
        return Promise.resolve([{ name: 'bot:ready-for-review' }]);
      if (method === 'DELETE')
        return Promise.reject(new Error('Not Found (404)'));
      return Promise.resolve({});
    });

    const result = await finishFixRound({
      prNumber: 42,
      replies: [{ issueId: 'ISSUE01', kind: 'JUSTIFY', body: 'covered' }],
    });

    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
    expect(data.labelReapplied).toBe(true);
    expect(data.errors).toEqual([]);

    const postCall = mockRest.mock.calls.find(
      ([args]) =>
        args.method === 'POST' &&
        args.path === '/repos/bkrupa/legacy-sports/issues/42/labels',
    );
    expect(postCall).toBeDefined();
  });
});
