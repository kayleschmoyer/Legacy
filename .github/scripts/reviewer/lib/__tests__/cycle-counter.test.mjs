import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCycle,
  isEscalationRequired,
  isInfraErrorReview,
  isThreadReplyArtifactReview,
  isCodeWriterBotAuthor,
  REVIEWER_BOT_LOGINS,
  CODE_WRITER_BOT_LOGIN,
  MAX_CYCLE,
  INFRA_ERROR_REVIEW_PREFIX,
  INFRA_ERROR_MARKER,
} from '../cycle-counter.mjs';

describe('computeCycle', () => {
  it('returns 1 when there are no prior reviews', () => {
    assert.strictEqual(computeCycle([]), 1);
  });

  it('returns 2 after one prior bot review', () => {
    const reviews = [{ userLogin: 'legacy-sports-review-bot[bot]' }];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('returns 3 after two prior bot reviews', () => {
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]' },
      { userLogin: 'legacy-sports-review-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 3);
  });

  it('ignores non-bot reviews when counting', () => {
    const reviews = [
      { userLogin: 'human-reviewer' },
      { userLogin: 'another-human' },
      { userLogin: 'some-other-bot[bot]' },
      { userLogin: 'legacy-sports-review-bot[bot]' },
    ];
    // Only one bot review matches REVIEWER_BOT_LOGINS → cycle 2
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('handles reviews with null userLogin gracefully', () => {
    const reviews = [
      { userLogin: null },
      { userLogin: 'legacy-sports-review-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('accepts a custom botLogins set for testing', () => {
    const customLogins = new Set(['my-test-bot[bot]']);
    const reviews = [
      { userLogin: 'my-test-bot[bot]' },
      { userLogin: 'legacy-sports-review-bot[bot]' }, // not in customLogins
    ];
    assert.strictEqual(computeCycle(reviews, customLogins), 2);
  });

  it('is not affected by the order of reviews in the list', () => {
    const reviews = [
      { userLogin: 'human' },
      { userLogin: 'legacy-sports-review-bot[bot]' },
      { userLogin: 'another-human' },
      { userLogin: 'legacy-sports-review-bot[bot]' },
    ];
    assert.strictEqual(computeCycle(reviews), 3);
  });

  it('excludes infra-error reviews from the cycle count', () => {
    const infraBody =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\nThe automated review could not complete due to a persistent LLM API failure.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('returns 2 when one real bot review is preceded by an infra-error review (infra not counted)', () => {
    const infraBody = INFRA_ERROR_REVIEW_PREFIX + '\n\nSome failure text.';
    const realBody =
      '## Changes Required\n\n**[CRITICAL]** SQL injection — `api.ts:42`\n\nDetails.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('does not exclude real reviews that happen to mention infrastructure in the body', () => {
    const realBody =
      '## Changes Required\n\n**[HIGH]** Cache infrastructure bug — `cache.ts:10`\n\nDetails.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('excludes multiple consecutive infra-error reviews, returning cycle 1', () => {
    const infraBody = INFRA_ERROR_REVIEW_PREFIX + '\n\nRetry exhausted.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  // AC: 3 consecutive infra failures → cycle counter stays at 1, no escalation
  it('excludes 3 consecutive infra-error reviews, cycle counter = 1 (no escalation)', () => {
    const infraBody =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\n<!-- bot-infra-failure: true -->\nThe automated review could not complete.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
    assert.strictEqual(isEscalationRequired(computeCycle(reviews)), false);
  });

  // AC: 1 real review followed by 1 infra failure → cycle counter = 2 (1 real prior cycle)
  it('returns 2 when one real bot review is followed by an infra-error review (infra not counted)', () => {
    const realBody =
      '## Changes Required\n\n**[HIGH]** Bug — `file.ts:1`\n\nDetails.';
    const infraBody =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\n<!-- bot-infra-failure: true -->\nThe automated review could not complete.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  // AC: 3 real review cycles → cycle counter = 4, escalation fires
  it('returns 4 after 3 real bot reviews, triggering escalation', () => {
    const realBody = '## Changes Required\n\n**[HIGH]** Bug — `file.ts:1`';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody },
    ];
    assert.strictEqual(computeCycle(reviews), 4);
    assert.strictEqual(isEscalationRequired(computeCycle(reviews)), true);
  });

  // AC: 2 real + 1 infra + 1 real = 3 real cycles → escalation fires after 3rd real cycle
  it('escalates only after 3rd real cycle when infra failures are interspersed', () => {
    const realBody = '## Changes Required\n\n**[HIGH]** Bug — `file.ts:1`';
    const infraBody =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\n<!-- bot-infra-failure: true -->\nThe automated review could not complete.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody }, // real #1
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody }, // real #2
      { userLogin: 'legacy-sports-review-bot[bot]', body: infraBody }, // infra (not counted)
      { userLogin: 'legacy-sports-review-bot[bot]', body: realBody }, // real #3
    ];
    assert.strictEqual(computeCycle(reviews), 4);
    assert.strictEqual(isEscalationRequired(computeCycle(reviews)), true);
  });

  it('treats reviews with no body field as non-infra (body defaults to empty string)', () => {
    const reviews = [{ userLogin: 'legacy-sports-review-bot[bot]' }];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('treats reviews with null body as non-infra', () => {
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', body: null },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('excludes DISMISSED reviews from the cycle count', () => {
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'DISMISSED',
        body: '## Changes Required\n\nSome finding.',
      },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('returns 2 when one real review is preceded by a DISMISSED review', () => {
    const realBody = '## Changes Required\n\n**[HIGH]** Bug — `file.ts:1`';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'DISMISSED',
        body: realBody,
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body: realBody,
      },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('excludes multiple consecutive DISMISSED reviews, returning cycle 1', () => {
    const body = '## Changes Required\n\nFinding.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'DISMISSED', body },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'DISMISSED', body },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'DISMISSED', body },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('excludes APPROVED reviews from the cycle count', () => {
    const body = '## Changes Required\n\nFinding.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
    ];
    // Only the CHANGES_REQUESTED review counts → cycle 2 (was 3 before PR #4362 fix)
    assert.strictEqual(computeCycle(reviews), 2);
  });

  // LS-4904: prior to this fix, a sequence of CHANGES_REQUESTED → APPROVED →
  // APPROVED on PR #4362 produced cycle=4 and false-triggered
  // needs-human-arbitration on an already-approved PR. APPROVED is a terminal
  // verdict, not an unresolved feedback loop, so it must not consume a cycle slot.
  it('does not escalate on the PR #4362 sequence (CHANGES_REQUESTED + 2 APPROVED)', () => {
    const body = '## Changes Required\n\nFinding.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
    ];
    const cycle = computeCycle(reviews);
    assert.strictEqual(cycle, 2);
    assert.strictEqual(isEscalationRequired(cycle), false);
  });

  it('returns cycle 1 for a single APPROVED review', () => {
    const body = '## LGTM\n\nApproved.';
    const reviews = [
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('escalates once real findings accumulate even with interleaved approvals', () => {
    const body = '## Changes Required\n\nFinding.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
      { userLogin: 'legacy-sports-review-bot[bot]', state: 'APPROVED', body },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
    ];
    // Only the 3 CHANGES_REQUESTED count → cycle 4 → escalation required.
    const cycle = computeCycle(reviews);
    assert.strictEqual(cycle, 4);
    assert.strictEqual(isEscalationRequired(cycle), true);
  });

  it('excludes both DISMISSED and infra-error reviews together', () => {
    const infraBody =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\n<!-- bot-infra-failure: true -->\nError.';
    const realBody = '## Changes Required\n\nFinding.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'DISMISSED',
        body: realBody,
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body: infraBody,
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body: realBody,
      },
    ];
    // Only the last real review counts → cycle 2
    assert.strictEqual(computeCycle(reviews), 2);
  });

  // LS-4474: empty-body COMMENTED reviews are GitHub-materialized artifacts of
  // postReviewThreadReply (in-thread bot replies) — they must NOT count as
  // real review cycles, or a single Cycle 1 review + a few format-error
  // replies will hit cycle=4 and false-trigger arbitration.
  it('excludes empty-body COMMENTED bot reviews (in-thread reply artifacts, LS-4474)', () => {
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '',
      },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('treats null-body COMMENTED bot reviews as reply artifacts', () => {
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: null,
      },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  // LS-4474 integration scenario: full reset → re-arm → re-review trip.
  //
  // Pre-reset state at the moment an admin applied bot:reset-cycle-counter:
  //   - 1 CHANGES_REQUESTED bot review (the legitimate Cycle 1 review)
  //   - 2 empty-body COMMENTED bot reviews (GitHub-materialized artifacts of
  //     in-thread FORMAT_ERROR_MESSAGE replies to malformed FIX comments)
  //
  // Post-reset state (after the admin-reset path dismisses dismissable bot
  // reviews and the run is then cancelled by a `bot:ready-for-review`
  // re-bounce before it can post a fresh review):
  //   - 1 DISMISSED bot review (the legitimate Cycle 1, now dismissed)
  //   - 2 empty-body COMMENTED bot reviews (unchanged — not dismissable)
  //
  // The surviving Run B must see cycle=1, NOT cycle=4 — both because the
  // dismissed real review and the empty-body COMMENTED reply artifacts are
  // both excluded from the cycle count.
  it('reset → re-arm → no-new-findings: cycle is 1 after dismissal even when reset run was cancelled (LS-4474)', () => {
    const realBody = '## Changes Required\n\nFinding from cycle 1.';
    const postResetReviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'DISMISSED',
        body: realBody,
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '',
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '',
      },
    ];
    assert.strictEqual(computeCycle(postResetReviews), 1);
    assert.strictEqual(
      isEscalationRequired(computeCycle(postResetReviews)),
      false,
    );
  });

  it('reproduces the LS-4474 scenario: 1 CHANGES_REQUESTED + 2 empty COMMENTED → cycle 2, not cycle 4', () => {
    const realBody = '## Changes Required\n\nFinding.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body: realBody,
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '',
      },
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '',
      },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
    assert.strictEqual(isEscalationRequired(computeCycle(reviews)), false);
  });

  it('does NOT exclude COMMENTED bot reviews that have a non-empty body', () => {
    // Defensive: future code could theoretically post a COMMENTED review with
    // content; only the *empty-body* artifact form is excluded.
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '## Note\n\nSome non-trivial content.',
      },
    ];
    assert.strictEqual(computeCycle(reviews), 2);
  });

  it('treats whitespace-only COMMENTED bot reviews as reply artifacts', () => {
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'COMMENTED',
        body: '   \n\t  \n',
      },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });

  it('excludes new-style infra-error review identified by INFRA_ERROR_MARKER substring', () => {
    const body =
      INFRA_ERROR_REVIEW_PREFIX +
      '\n\n<!-- bot-infra-failure: true -->\nThe automated review could not complete.';
    const reviews = [
      {
        userLogin: 'legacy-sports-review-bot[bot]',
        state: 'CHANGES_REQUESTED',
        body,
      },
    ];
    assert.strictEqual(computeCycle(reviews), 1);
  });
});

describe('isEscalationRequired', () => {
  it('returns false for cycle 1', () => {
    assert.strictEqual(isEscalationRequired(1), false);
  });

  it('returns false for cycle 2', () => {
    assert.strictEqual(isEscalationRequired(2), false);
  });

  it('returns false for cycle 3 (MAX_CYCLE)', () => {
    assert.strictEqual(isEscalationRequired(3), false);
  });

  it('returns true for cycle 4 (first cycle that exceeds MAX_CYCLE)', () => {
    assert.strictEqual(isEscalationRequired(4), true);
  });

  it('returns true for higher cycles', () => {
    assert.strictEqual(isEscalationRequired(10), true);
  });
});

describe('REVIEWER_BOT_LOGINS', () => {
  it('includes legacy-sports-review-bot[bot] as the reviewer identity', () => {
    assert.ok(REVIEWER_BOT_LOGINS.has('legacy-sports-review-bot[bot]'));
  });
});

describe('MAX_CYCLE', () => {
  it('is 3', () => {
    assert.strictEqual(MAX_CYCLE, 3);
  });
});

describe('INFRA_ERROR_REVIEW_PREFIX', () => {
  it('matches the opening line of postInfraErrorReview bodies', () => {
    const infraBody =
      '## Review bot infrastructure error\n\n' +
      '<!-- bot-infra-failure: true -->\n' +
      'The automated review could not complete due to a persistent LLM API failure (3 retries exhausted).\n\n' +
      'Apply the `bot:ready-for-review` label to re-trigger, or request a human review.';
    assert.ok(infraBody.startsWith(INFRA_ERROR_REVIEW_PREFIX));
  });
});

describe('INFRA_ERROR_MARKER', () => {
  it('is the substring embedded in infra-error review bodies', () => {
    assert.strictEqual(INFRA_ERROR_MARKER, 'bot-infra-failure');
  });

  it('is contained in the HTML comment embedded in new infra-error review bodies', () => {
    const htmlComment = '<!-- bot-infra-failure: true -->';
    assert.ok(htmlComment.includes(INFRA_ERROR_MARKER));
  });
});

describe('isThreadReplyArtifactReview', () => {
  it('returns true for empty-body COMMENTED reviews (the artifact form)', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'COMMENTED', body: '' }),
      true,
    );
  });

  it('returns true for null-body COMMENTED reviews', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'COMMENTED', body: null }),
      true,
    );
  });

  it('returns true for whitespace-only-body COMMENTED reviews', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'COMMENTED', body: '   \n  ' }),
      true,
    );
  });

  it('returns false for COMMENTED reviews with real content', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'COMMENTED', body: 'Real text' }),
      false,
    );
  });

  it('returns false for CHANGES_REQUESTED reviews regardless of body', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'CHANGES_REQUESTED', body: '' }),
      false,
    );
  });

  it('returns false for APPROVED reviews regardless of body', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'APPROVED', body: null }),
      false,
    );
  });

  it('returns false for DISMISSED reviews (handled by separate exclusion)', () => {
    assert.strictEqual(
      isThreadReplyArtifactReview({ state: 'DISMISSED', body: '' }),
      false,
    );
  });
});

describe('isInfraErrorReview', () => {
  it('returns true for a review with the legacy heading prefix', () => {
    const r = { body: '## Review bot infrastructure error\n\nSome text.' };
    assert.strictEqual(isInfraErrorReview(r), true);
  });

  it('returns true for a review with the new HTML marker', () => {
    const r = {
      body: '## Review bot infrastructure error\n\n<!-- bot-infra-failure: true -->\nSome text.',
    };
    assert.strictEqual(isInfraErrorReview(r), true);
  });

  it('returns false for a normal review body', () => {
    const r = { body: '## Changes Required\n\n**[HIGH]** Bug — `file.ts:1`' };
    assert.strictEqual(isInfraErrorReview(r), false);
  });

  it('returns false for an empty body', () => {
    assert.strictEqual(isInfraErrorReview({ body: '' }), false);
  });

  it('returns false for null body', () => {
    assert.strictEqual(isInfraErrorReview({ body: null }), false);
  });

  it('returns false for undefined body', () => {
    assert.strictEqual(isInfraErrorReview({}), false);
  });

  it('returns false for a review that mentions infrastructure in context but is not an infra-error review', () => {
    const r = {
      body: '## Changes Required\n\n**[HIGH]** Cache infrastructure bug',
    };
    assert.strictEqual(isInfraErrorReview(r), false);
  });
});

// ---------------------------------------------------------------------------
// isCodeWriterBotAuthor — author type classification for telemetry
// (author identity does NOT affect review behavior — all PRs use the full
// cycle protocol regardless of author)
// ---------------------------------------------------------------------------

describe('isCodeWriterBotAuthor', () => {
  it('returns true for code-writer-bot[bot] with is_bot flag', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({ login: 'code-writer-bot[bot]', is_bot: true }),
      true,
    );
  });

  it('returns true for code-writer-bot[bot] inferred from [bot] suffix when is_bot is absent', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({ login: 'code-writer-bot[bot]' }),
      true,
    );
  });

  it('returns false for a human-authored PR (no [bot] suffix)', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({ login: 'bkrupa21', is_bot: false }),
      false,
    );
  });

  it('returns false for a different bot (reviewer bot is not the author bot)', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({
        login: 'legacy-sports-review-bot[bot]',
        is_bot: true,
      }),
      false,
    );
  });

  it('returns false for an agent-authored PR where login is the developer identity', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({ login: 'some-developer', is_bot: false }),
      false,
    );
  });

  it('returns false when author is null', () => {
    assert.strictEqual(isCodeWriterBotAuthor(null), false);
  });

  it('returns false when author is undefined', () => {
    assert.strictEqual(isCodeWriterBotAuthor(undefined), false);
  });

  it('returns false when author has no login', () => {
    assert.strictEqual(isCodeWriterBotAuthor({}), false);
  });

  it('returns false when is_bot is explicitly false even with code-writer-bot login', () => {
    assert.strictEqual(
      isCodeWriterBotAuthor({ login: 'code-writer-bot[bot]', is_bot: false }),
      false,
    );
  });
});

describe('CODE_WRITER_BOT_LOGIN', () => {
  it('is the expected login string', () => {
    assert.strictEqual(CODE_WRITER_BOT_LOGIN, 'code-writer-bot[bot]');
  });
});
