import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLlmApprovalReview,
  findLatestBotApproval,
  hasCycleResetSince,
  normalizePatch,
  fingerprintCompare,
  checkDiffUnchangedSinceApproval,
  buildReaffirmNotice,
  COMPARE_MAX_FILES,
  REAFFIRMED_APPROVAL_MARKER,
} from '../unchanged-diff.mjs';
import { APPROVE_BODY_TEXT, formatReviewBody } from '../post-review.mjs';
import { computeCycle, INFRA_ERROR_MARKER } from '../cycle-counter.mjs';

const BOT = 'legacy-sports-review-bot[bot]';
const SHA_A = 'a'.repeat(40);
const SHA_H = 'b'.repeat(40);

const approval = (overrides = {}) => ({
  userLogin: BOT,
  state: 'DISMISSED',
  body: APPROVE_BODY_TEXT,
  submittedAt: '2026-10-01T10:00:00Z',
  commitId: SHA_A,
  ...overrides,
});

const changesRequested = (overrides = {}) => ({
  userLogin: BOT,
  state: 'CHANGES_REQUESTED',
  body: '## Changes Required\n\n**[HIGH]** Bug — `a.ts:1`\n\nbody',
  submittedAt: '2026-10-01T09:00:00Z',
  commitId: 'c'.repeat(40),
  ...overrides,
});

const file = (overrides = {}) => ({
  filename: 'src/a.ts',
  status: 'modified',
  patch: '@@ -10,3 +10,4 @@ function foo() {\n context\n-old\n+new\n+added',
  sha: 'f'.repeat(40),
  ...overrides,
});

/** Fake `gh api compare` exec keyed by the head SHA in the basehead segment. */
function compareExec(bySha) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args);
    const path = args[1];
    const head = path.split('...')[1];
    if (!(head in bySha)) throw new Error(`unexpected compare ${path}`);
    const v = bySha[head];
    if (v instanceof Error) throw v;
    return JSON.stringify(v);
  };
  return { exec, calls };
}

describe('isLlmApprovalReview', () => {
  it('matches an APPROVED review with the clean-approve body', () => {
    assert.ok(isLlmApprovalReview(approval({ state: 'APPROVED' })));
  });

  it('matches a DISMISSED review whose body records an approval (dismiss_stale_reviews_on_push)', () => {
    assert.ok(isLlmApprovalReview(approval({ state: 'DISMISSED' })));
  });

  it('matches an approval carrying the fallback-model banner', () => {
    const body = formatReviewBody([], 'APPROVE', [], {
      fallbackModel: 'gemini-2.5-flash-lite',
    });
    assert.ok(isLlmApprovalReview(approval({ body })));
  });

  it('does not match a dismissed REQUEST_CHANGES review', () => {
    assert.ok(!isLlmApprovalReview(changesRequested({ state: 'DISMISSED' })));
  });

  it('does not match the review-bot-override approval (never reviewed the diff)', () => {
    assert.ok(
      !isLlmApprovalReview(
        approval({ state: 'APPROVED', body: 'LGTM — override applied.' }),
      ),
    );
  });

  it('does not match a COMMENTED review', () => {
    assert.ok(!isLlmApprovalReview(approval({ state: 'COMMENTED' })));
  });
});

describe('findLatestBotApproval', () => {
  it('returns the approval when it is the latest bot verdict', () => {
    const a = approval();
    assert.strictEqual(findLatestBotApproval([changesRequested(), a]), a);
  });

  it('sorts by submittedAt regardless of API order', () => {
    const a = approval();
    assert.strictEqual(findLatestBotApproval([a, changesRequested()]), a);
  });

  it('returns null when a later REQUEST_CHANGES (even dismissed) follows the approval', () => {
    const reviews = [
      approval({ submittedAt: '2026-10-01T08:00:00Z' }),
      changesRequested({ state: 'DISMISSED' }),
    ];
    assert.strictEqual(findLatestBotApproval(reviews), null);
  });

  it('skips infra-error and thread-reply-artifact reviews posted after the approval', () => {
    const a = approval();
    const reviews = [
      a,
      {
        userLogin: BOT,
        state: 'COMMENTED',
        body: `<!-- ${INFRA_ERROR_MARKER}: true -->`,
        submittedAt: '2026-10-01T11:00:00Z',
        commitId: SHA_H,
      },
      {
        userLogin: BOT,
        state: 'COMMENTED',
        body: '',
        submittedAt: '2026-10-01T12:00:00Z',
        commitId: SHA_H,
      },
    ];
    assert.strictEqual(findLatestBotApproval(reviews), a);
  });

  it('ignores approvals from other users', () => {
    assert.strictEqual(
      findLatestBotApproval([approval({ userLogin: 'some-human' })]),
      null,
    );
  });

  it('returns null without a commitId', () => {
    assert.strictEqual(
      findLatestBotApproval([approval({ commitId: null })]),
      null,
    );
  });

  it('returns null with no reviews', () => {
    assert.strictEqual(findLatestBotApproval([]), null);
  });
});

describe('hasCycleResetSince', () => {
  it('detects an admin reset comment posted after the approval', () => {
    assert.ok(
      hasCycleResetSince(
        [
          {
            body: '> [!NOTE]\n> Cycle counter reset by `admin` at …',
            createdAt: '2026-10-02T00:00:00Z',
          },
        ],
        '2026-10-01T10:00:00Z',
      ),
    );
  });

  it('detects a post-arbitration auto-reset comment', () => {
    assert.ok(
      hasCycleResetSince(
        [
          {
            body: 'Cycle counter auto-reset (1 prior bot review(s) dismissed).',
            createdAt: '2026-10-02T00:00:00Z',
          },
        ],
        '2026-10-01T10:00:00Z',
      ),
    );
  });

  it('ignores reset comments that predate the approval', () => {
    assert.ok(
      !hasCycleResetSince(
        [
          {
            body: 'Cycle counter reset by `admin`',
            createdAt: '2026-09-30T00:00:00Z',
          },
        ],
        '2026-10-01T10:00:00Z',
      ),
    );
  });
});

describe('normalizePatch', () => {
  it('strips hunk-header offsets and section headings but keeps every body line', () => {
    assert.strictEqual(
      normalizePatch('@@ -10,3 +10,4 @@ function foo() {\n ctx\n-a\n+b'),
      '@@\n ctx\n-a\n+b',
    );
  });
});

describe('fingerprintCompare', () => {
  it('is equal when only hunk offsets moved (base-branch lines added above the hunk)', () => {
    const shifted = file({
      patch: '@@ -25,3 +25,4 @@ class Bar {\n context\n-old\n+new\n+added',
    });
    assert.strictEqual(
      fingerprintCompare({ files: [file()] }),
      fingerprintCompare({ files: [shifted] }),
    );
  });

  it('is order-independent across files', () => {
    const b = file({ filename: 'src/b.ts' });
    assert.strictEqual(
      fingerprintCompare({ files: [file(), b] }),
      fingerprintCompare({ files: [b, file()] }),
    );
  });

  it('differs when an added line changes', () => {
    const changed = file({
      patch: '@@ -10,3 +10,4 @@\n context\n-old\n+NEW\n+added',
    });
    assert.notStrictEqual(
      fingerprintCompare({ files: [file()] }),
      fingerprintCompare({ files: [changed] }),
    );
  });

  it('differs when a context line changes', () => {
    const changed = file({
      patch: '@@ -10,3 +10,4 @@\n other\n-old\n+new\n+added',
    });
    assert.notStrictEqual(
      fingerprintCompare({ files: [file()] }),
      fingerprintCompare({ files: [changed] }),
    );
  });

  it('differs when a file is added to the diff', () => {
    assert.notStrictEqual(
      fingerprintCompare({ files: [file()] }),
      fingerprintCompare({
        files: [file(), file({ filename: 'src/c.ts', status: 'added' })],
      }),
    );
  });

  it('differs on status or rename source', () => {
    const base = fingerprintCompare({ files: [file()] });
    assert.notStrictEqual(
      base,
      fingerprintCompare({ files: [file({ status: 'added' })] }),
    );
    assert.notStrictEqual(
      base,
      fingerprintCompare({
        files: [file({ status: 'renamed', previous_filename: 'src/old.ts' })],
      }),
    );
  });

  it('falls back to the blob SHA for files without a patch (binary / too large)', () => {
    const bin = (sha) =>
      file({ filename: 'img.png', patch: undefined, sha: sha.repeat(40) });
    assert.strictEqual(
      fingerprintCompare({ files: [bin('1')] }),
      fingerprintCompare({ files: [bin('1')] }),
    );
    assert.notStrictEqual(
      fingerprintCompare({ files: [bin('1')] }),
      fingerprintCompare({ files: [bin('2')] }),
    );
  });

  it('returns null when the file list is missing', () => {
    assert.strictEqual(fingerprintCompare({}), null);
    assert.strictEqual(fingerprintCompare(null), null);
  });

  it(`returns null at GitHub's ${COMPARE_MAX_FILES}-file cap (list may be truncated)`, () => {
    const files = Array.from({ length: COMPARE_MAX_FILES }, (_, i) =>
      file({ filename: `f${i}.ts` }),
    );
    assert.strictEqual(fingerprintCompare({ files }), null);
  });
});

describe('checkDiffUnchangedSinceApproval', () => {
  const base = { headSha: SHA_H, baseRef: 'main', issueComments: [] };

  it('reports unchanged when both compares fingerprint identically', () => {
    const { exec, calls } = compareExec({
      [SHA_A]: { files: [file()] },
      [SHA_H]: {
        files: [
          file({ patch: '@@ -40,3 +40,4 @@\n context\n-old\n+new\n+added' }),
        ],
      },
    });
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [changesRequested(), approval()],
      exec,
    });
    assert.strictEqual(res.unchanged, true);
    assert.strictEqual(res.approvedSha, SHA_A);
    assert.deepStrictEqual(
      calls.map((a) => a[1]),
      [
        `repos/{owner}/{repo}/compare/main...${SHA_A}`,
        `repos/{owner}/{repo}/compare/main...${SHA_H}`,
      ],
    );
  });

  it('reports changed when the diffs differ', () => {
    const { exec } = compareExec({
      [SHA_A]: { files: [file()] },
      [SHA_H]: { files: [file(), file({ filename: 'src/new.ts' })] },
    });
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [approval()],
      exec,
    });
    assert.strictEqual(res.unchanged, false);
    assert.match(res.reason, /diff changed/);
  });

  it('short-circuits without API calls when the approval is on the head SHA itself', () => {
    const { exec, calls } = compareExec({});
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [approval({ commitId: SHA_H, state: 'APPROVED' })],
      exec,
    });
    assert.strictEqual(res.unchanged, true);
    assert.strictEqual(calls.length, 0);
  });

  it('requires a review when the latest bot verdict is not an approval', () => {
    const { exec, calls } = compareExec({});
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [
        approval({ submittedAt: '2026-10-01T08:00:00Z' }),
        changesRequested(),
      ],
      exec,
    });
    assert.strictEqual(res.unchanged, false);
    assert.strictEqual(calls.length, 0);
  });

  it('requires a review when the cycle counter was reset after the approval', () => {
    const { exec } = compareExec({
      [SHA_A]: { files: [file()] },
      [SHA_H]: { files: [file()] },
    });
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      issueComments: [
        {
          body: 'Cycle counter reset by `admin`',
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
      reviews: [approval()],
      exec,
    });
    assert.strictEqual(res.unchanged, false);
    assert.match(res.reason, /reset/);
  });

  it('fails open when the compare API throws', () => {
    const { exec } = compareExec({
      [SHA_A]: { files: [file()] },
      [SHA_H]: new Error('HTTP 404'),
    });
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [approval()],
      exec,
    });
    assert.strictEqual(res.unchanged, false);
    assert.match(res.reason, /comparison failed: HTTP 404/);
  });

  it('fails open on malformed JSON', () => {
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [approval()],
      exec: () => 'not json',
    });
    assert.strictEqual(res.unchanged, false);
    assert.match(res.reason, /comparison failed/);
  });

  it('fails open when a compare response is unusable', () => {
    const { exec } = compareExec({
      [SHA_A]: { files: [file()] },
      [SHA_H]: { message: 'no files' },
    });
    const res = checkDiffUnchangedSinceApproval({
      ...base,
      reviews: [approval()],
      exec,
    });
    assert.strictEqual(res.unchanged, false);
    assert.match(res.reason, /unusable/);
  });

  it('fails open without a head SHA or base ref', () => {
    const exec = () => {
      throw new Error('must not be called');
    };
    assert.strictEqual(
      checkDiffUnchangedSinceApproval({
        reviews: [approval()],
        headSha: '',
        baseRef: 'main',
        exec,
      }).unchanged,
      false,
    );
    assert.strictEqual(
      checkDiffUnchangedSinceApproval({
        reviews: [approval()],
        headSha: SHA_H,
        baseRef: '',
        exec,
      }).unchanged,
      false,
    );
  });
});

describe('re-affirmed approval review body', () => {
  const body = formatReviewBody([], 'APPROVE', [], {
    notice: buildReaffirmNotice(SHA_A),
  });

  it('carries the brief note with the short approved SHA and the marker', () => {
    assert.match(
      body,
      /Diff unchanged since approved `aaaaaaa`; re-affirmed without re-review/,
    );
    assert.ok(
      body.includes(`<!-- ${REAFFIRMED_APPROVAL_MARKER}: ${SHA_A} -->`),
    );
    assert.ok(body.includes(APPROVE_BODY_TEXT));
  });

  it('is itself recognised as an approval, so re-affirmations chain', () => {
    assert.ok(isLlmApprovalReview({ state: 'DISMISSED', body }));
  });

  it('does not consume a review cycle', () => {
    const reviews = [
      changesRequested(),
      approval(),
      approval({
        state: 'APPROVED',
        body,
        commitId: SHA_H,
        submittedAt: '2026-10-02T10:00:00Z',
      }),
    ];
    assert.strictEqual(
      computeCycle(reviews),
      computeCycle([changesRequested()]),
    );
  });
});
