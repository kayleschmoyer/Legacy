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

const { githubRest: mockRest, githubGraphQL: mockGraphQL } = jest.requireMock(
  '../github-api',
) as {
  githubRest: jest.Mock;
  githubGraphQL: jest.Mock;
};
const { getRepoOwnerName: mockRepo } = jest.requireMock('../auth') as {
  getRepoOwnerName: jest.Mock;
};

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
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

  it('rejects missing threadId', () => {
    const errs = validateReplies([
      { threadId: '', kind: 'FIX', sha: 'abc123' },
    ]);
    expect(errs.some((e) => /threadId/.test(e.message))).toBe(true);
  });

  it('accepts a well-formed mixed batch', () => {
    expect(
      validateReplies([
        { threadId: 'PRRT_1', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_2', kind: 'JUSTIFY', body: 'not a bug' },
        { threadId: 'PRRT_3', kind: 'CANNOT-COMPLY', body: 'LS-1\nreason' },
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
    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
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
    mockRest.mockResolvedValue({});

    const result = await finishFixRound({
      prNumber: 42,
      replies: [
        { threadId: 'PRRT_1', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_2', kind: 'JUSTIFY', body: 'intentional' },
      ],
    });

    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
    expect(data.replied).toBe(2);
    expect(data.resolved).toBe(1);
    expect(data.labelApplied).toBe(true);

    // FIX body is exactly `FIX: <sha>`
    const fixCall = mockGraphQL.mock.calls.find(
      ([, vars]) => (vars as { threadId: string }).threadId === 'PRRT_1',
    );
    expect((fixCall![1] as { body: string }).body).toBe('FIX: abc1234');

    // JUSTIFY prefixed
    const justifyCall = mockGraphQL.mock.calls.find(
      ([, vars]) => (vars as { threadId: string }).threadId === 'PRRT_2',
    );
    expect((justifyCall![1] as { body: string }).body).toBe(
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
      (q as string).includes('resolveReviewThread'),
    );
    const resolveVars = resolveCall![1] as Record<string, string>;
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
    mockRest.mockResolvedValue({});

    const result = await finishFixRound({
      prNumber: 42,
      replies: [
        { threadId: 'PRRT_FAIL', kind: 'FIX', sha: 'abc1234' },
        { threadId: 'PRRT_OK', kind: 'FIX', sha: 'def5678' },
      ],
    });

    const data = parse(
      result as { content: Array<{ type: string; text: string }> },
    );
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
      (q as string).includes('resolveReviewThread'),
    );
    const resolveVars = resolveCall![1] as Record<string, string>;
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
    mockRest.mockResolvedValue({});

    await finishFixRound({
      prNumber: 99,
      replies: [{ threadId: 'PRRT_J', kind: 'JUSTIFY', body: 'fine' }],
    });

    const resolveCall = mockGraphQL.mock.calls.find(([q]) =>
      (q as string).includes('resolveReviewThread'),
    );
    expect(resolveCall).toBeUndefined();
  });
});
