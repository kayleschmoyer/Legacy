import {
  CONFLICT_CHECK_NAME,
  CONFLICT_LABEL,
  detectConflictSignals,
  isConflictCheckFailure,
  isStaleConflictSignalOnly,
} from './conflict-signals';

describe('isConflictCheckFailure', () => {
  it('matches the bare check name', () => {
    expect(isConflictCheckFailure(CONFLICT_CHECK_NAME)).toBe(true);
  });

  it('matches the processor-style failure entry', () => {
    expect(isConflictCheckFailure(`${CONFLICT_CHECK_NAME} (failure)`)).toBe(
      true,
    );
  });

  it('does not match cancelled or timed-out conflict-check runs', () => {
    expect(isConflictCheckFailure(`${CONFLICT_CHECK_NAME} (cancelled)`)).toBe(
      false,
    );
    expect(isConflictCheckFailure(`${CONFLICT_CHECK_NAME} (timed_out)`)).toBe(
      false,
    );
  });

  it('does not match other checks', () => {
    expect(isConflictCheckFailure('lint (failure)')).toBe(false);
  });
});

describe('detectConflictSignals', () => {
  it('fires on mergeable CONFLICTING alone', () => {
    const result = detectConflictSignals({ mergeable: 'CONFLICTING' });
    expect(result.conflicting).toBe(true);
    expect(result.sources).toEqual(['mergeable:CONFLICTING']);
  });

  it('fires on the CI: Conflicts label even when mergeable is MERGEABLE (stale GraphQL)', () => {
    const result = detectConflictSignals({
      mergeable: 'MERGEABLE',
      labels: ['bot:ready-for-review', CONFLICT_LABEL],
    });
    expect(result.conflicting).toBe(true);
    expect(result.sources).toEqual([`label:${CONFLICT_LABEL}`]);
  });

  it('fires on a failing No Merge Conflicts check even when mergeable is UNKNOWN', () => {
    const result = detectConflictSignals({
      mergeable: 'UNKNOWN',
      failingChecks: ['lint (failure)', `${CONFLICT_CHECK_NAME} (failure)`],
    });
    expect(result.conflicting).toBe(true);
    expect(result.sources).toEqual([`check:${CONFLICT_CHECK_NAME} (failure)`]);
  });

  it('reports every signal that fired', () => {
    const result = detectConflictSignals({
      mergeable: 'CONFLICTING',
      labels: [CONFLICT_LABEL],
      failingChecks: [`${CONFLICT_CHECK_NAME} (failure)`],
    });
    expect(result.sources).toHaveLength(3);
  });

  it('stays quiet when no signal fires', () => {
    const result = detectConflictSignals({
      mergeable: 'MERGEABLE',
      labels: ['dependencies'],
      failingChecks: ['lint (failure)'],
    });
    expect(result.conflicting).toBe(false);
    expect(result.sources).toEqual([]);
  });

  it('handles absent inputs', () => {
    expect(detectConflictSignals({}).conflicting).toBe(false);
  });

  it('fires on mergeStateStatus DIRTY even while mergeable is UNKNOWN (LS-10375)', () => {
    const result = detectConflictSignals({
      mergeable: 'UNKNOWN',
      mergeStateStatus: 'DIRTY',
    });
    expect(result.conflicting).toBe(true);
    expect(result.sources).toEqual(['mergeState:DIRTY']);
  });

  it('negative control: non-DIRTY mergeStateStatus values do not fire', () => {
    for (const status of [
      'CLEAN',
      'BEHIND',
      'BLOCKED',
      'UNSTABLE',
      'UNKNOWN',
    ]) {
      expect(
        detectConflictSignals({
          mergeable: 'UNKNOWN',
          mergeStateStatus: status,
        }).conflicting,
      ).toBe(false);
    }
  });
});

describe('isStaleConflictSignalOnly (LS-9945)', () => {
  const labelOnly = detectConflictSignals({ labels: [CONFLICT_LABEL] });

  it('is true for a label-only verdict when live fields confirm clear', () => {
    expect(
      isStaleConflictSignalOnly(labelOnly, {
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
      }),
    ).toBe(true);
  });

  it('negative control: false while mergeable is UNKNOWN (not yet confirmed clear)', () => {
    expect(
      isStaleConflictSignalOnly(labelOnly, {
        mergeable: 'UNKNOWN',
        mergeStateStatus: 'UNKNOWN',
      }),
    ).toBe(false);
  });

  it('negative control: false when GitHub itself reports CONFLICTING or DIRTY', () => {
    const live = detectConflictSignals({
      mergeable: 'CONFLICTING',
      mergeStateStatus: 'DIRTY',
      labels: [CONFLICT_LABEL],
    });
    expect(
      isStaleConflictSignalOnly(live, {
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'CLEAN',
      }),
    ).toBe(false);
  });
});
