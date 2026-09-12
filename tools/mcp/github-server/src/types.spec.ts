import {
  CI_FAILURE_CONCLUSIONS,
  FAILED_CONCLUSIONS,
  NON_RESULT_CONCLUSIONS,
  summarizeCIStatus,
  SUPERSEDED_CONCLUSIONS,
} from './types';

function check(name: string, conclusion: string | null, status = 'COMPLETED') {
  return { name, status, conclusion };
}

describe('summarizeCIStatus', () => {
  it('returns none for null or empty check lists', () => {
    expect(summarizeCIStatus(null)).toBe('none');
    expect(summarizeCIStatus([])).toBe('none');
  });

  it('returns pass when every check succeeded', () => {
    expect(
      summarizeCIStatus([check('build', 'SUCCESS'), check('test', 'SUCCESS')]),
    ).toBe('pass');
  });

  it.each([...NON_RESULT_CONCLUSIONS])(
    'treats a %s check as a non-result, not a failure (LS-10116)',
    (conclusion) => {
      expect(
        summarizeCIStatus([
          check('build', 'SUCCESS'),
          check('queue', conclusion),
        ]),
      ).toBe('pass');
    },
  );

  it.each([...CI_FAILURE_CONCLUSIONS])(
    'returns fail for a %s check',
    (conclusion) => {
      expect(
        summarizeCIStatus([
          check('build', 'SUCCESS'),
          check('gate', conclusion),
        ]),
      ).toBe('fail');
    },
  );

  it('returns fail when a real failure coexists with cancelled checks', () => {
    expect(
      summarizeCIStatus([
        check('queue', 'CANCELLED'),
        check('lint', 'FAILURE'),
        check('build', 'SUCCESS'),
      ]),
    ).toBe('fail');
  });

  it('returns pending for in-flight checks and for unrecognized conclusions', () => {
    expect(
      summarizeCIStatus([
        check('build', null, 'IN_PROGRESS'),
        check('test', 'SUCCESS'),
      ]),
    ).toBe('pending');
    expect(
      summarizeCIStatus([check('gate', 'AWAITING_COMMISSIONER_REVIEW')]),
    ).toBe('pending');
  });

  it('returns pending when a cancelled check coexists with in-flight work', () => {
    expect(
      summarizeCIStatus([
        check('queue', 'CANCELLED'),
        check('build', null, 'QUEUED'),
      ]),
    ).toBe('pending');
  });

  it('keeps the conclusion sets disjoint', () => {
    for (const conclusion of NON_RESULT_CONCLUSIONS) {
      expect(CI_FAILURE_CONCLUSIONS.has(conclusion)).toBe(false);
    }
    // Superseded conclusions are the reportable subset of the non-results;
    // SKIPPED is a non-result but was never superseded by anything.
    for (const conclusion of SUPERSEDED_CONCLUSIONS) {
      expect(NON_RESULT_CONCLUSIONS.has(conclusion)).toBe(true);
    }
    expect(SUPERSEDED_CONCLUSIONS.has('SKIPPED')).toBe(false);
  });

  it('keeps the retrigger-oriented FAILED_CONCLUSIONS set distinct', () => {
    // github_retrigger_check wants to re-dispatch cancelled runs, so CANCELLED
    // stays in that set even though it is not a summary failure.
    expect(FAILED_CONCLUSIONS.has('CANCELLED')).toBe(true);
    expect(CI_FAILURE_CONCLUSIONS.has('CANCELLED')).toBe(false);
  });
});
