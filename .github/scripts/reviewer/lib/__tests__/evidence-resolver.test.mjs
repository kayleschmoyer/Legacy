import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPrNumberCitations,
  extractShaCitations,
  extractRunIdCitations,
  resolvePrCitation,
  resolveShaCitation,
  resolveRunCitation,
  resolveCitedEvidence,
  formatEvidenceResolutionSection,
} from '../evidence-resolver.mjs';

function makeExec(handlers) {
  return (cmd, args) => {
    assert.equal(cmd, 'gh');
    for (const handler of handlers) {
      const result = handler(args);
      if (result !== undefined) return result;
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
}

describe('extractPrNumberCitations', () => {
  it('returns [] for empty/missing text', () => {
    assert.deepEqual(extractPrNumberCitations(''), []);
    assert.deepEqual(extractPrNumberCitations(null), []);
    assert.deepEqual(extractPrNumberCitations(undefined), []);
  });

  it('extracts a single #-prefixed PR number', () => {
    assert.deepEqual(
      extractPrNumberCitations('already merged via PR #4871'),
      [4871],
    );
  });

  it('extracts and dedups multiple PR numbers', () => {
    assert.deepEqual(
      extractPrNumberCitations('see #123 and also #456, and #123 again'),
      [123, 456],
    );
  });

  it('ignores bare numbers without a # prefix', () => {
    assert.deepEqual(extractPrNumberCitations('run 12345 passed'), []);
  });
});

describe('extractShaCitations', () => {
  it('returns [] for empty/missing text', () => {
    assert.deepEqual(extractShaCitations(''), []);
    assert.deepEqual(extractShaCitations(null), []);
  });

  it('extracts a hex SHA not in the current PR history', () => {
    assert.deepEqual(extractShaCitations('fixed in 486f66203 already', []), [
      '486f66203',
    ]);
  });

  it('excludes a SHA that is in the current PR history', () => {
    assert.deepEqual(
      extractShaCitations('fixed in 486f66203 already', [
        '486f66203aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ]),
      [],
    );
  });

  it('rejects a pure-digit candidate (ambiguous with a number, not a SHA)', () => {
    assert.deepEqual(extractShaCitations('see run 1234567890123'), []);
  });

  it('dedups and lowercases candidates', () => {
    assert.deepEqual(
      extractShaCitations('486F66203 and 486f66203 are the same', []),
      ['486f66203'],
    );
  });
});

describe('extractRunIdCitations', () => {
  it('returns [] for empty/missing text', () => {
    assert.deepEqual(extractRunIdCitations(''), []);
    assert.deepEqual(extractRunIdCitations(null), []);
  });

  it('extracts a run ID following a "run" cue', () => {
    assert.deepEqual(extractRunIdCitations('run 26377350526 already passed'), [
      '26377350526',
    ]);
  });

  it('extracts multiple run IDs following a "runs" cue', () => {
    assert.deepEqual(
      extractRunIdCitations(
        'the same test is red on main (runs 26377350526 / 26376950715, both predating the branch)',
      ),
      ['26377350526', '26376950715'],
    );
  });

  it('does not extract a bare number with no run cue nearby', () => {
    assert.deepEqual(
      extractRunIdCitations('the PR touches 26377350526 lines of config'),
      [],
    );
  });

  it('does not treat a PR number as a run ID', () => {
    assert.deepEqual(extractRunIdCitations('see PR #4871 for details'), []);
  });
});

describe('resolvePrCitation', () => {
  it('returns the resolved fact for a merged PR', () => {
    const exec = makeExec([
      (args) =>
        args[0] === 'pr' && args[1] === 'view'
          ? JSON.stringify({
              state: 'MERGED',
              mergedAt: '2026-07-01T00:00:00Z',
              title: 'feat: apple oauth handler',
              url: 'https://github.com/o/r/pull/4871',
            })
          : undefined,
    ]);
    assert.deepEqual(resolvePrCitation(4871, exec), {
      kind: 'pr',
      number: 4871,
      state: 'MERGED',
      merged: true,
      mergedAt: '2026-07-01T00:00:00Z',
      title: 'feat: apple oauth handler',
      url: 'https://github.com/o/r/pull/4871',
    });
  });

  it('reports merged: false for a non-merged PR', () => {
    const exec = makeExec([
      () =>
        JSON.stringify({ state: 'OPEN', mergedAt: null, title: 't', url: 'u' }),
    ]);
    const result = resolvePrCitation(1, exec);
    assert.equal(result.merged, false);
    assert.equal(result.state, 'OPEN');
  });

  it('returns null when gh fails (not found, rate limit, etc.)', () => {
    const exec = () => {
      throw new Error('gh: pull request not found');
    };
    assert.equal(resolvePrCitation(99999, exec), null);
  });
});

describe('resolveShaCitation', () => {
  it('returns exists: true with no merged PR when the pulls lookup is empty', () => {
    const exec = makeExec([
      (args) => (args[1].includes('/pulls') ? JSON.stringify([]) : undefined),
      (args) =>
        !args[1].includes('/pulls')
          ? JSON.stringify({ sha: '486f66203aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
          : undefined,
    ]);
    assert.deepEqual(resolveShaCitation('486f66203', exec), {
      kind: 'sha',
      sha: '486f66203',
      fullSha: '486f66203aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      exists: true,
      mergedViaPr: null,
    });
  });

  it('reports which PR merged the commit when the pulls lookup finds one', () => {
    const exec = makeExec([
      (args) =>
        args[1].includes('/pulls')
          ? JSON.stringify([
              { number: 4871, merged_at: '2026-07-01T00:00:00Z' },
            ])
          : undefined,
      (args) =>
        !args[1].includes('/pulls')
          ? JSON.stringify({ sha: '486f66203aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
          : undefined,
    ]);
    assert.equal(resolveShaCitation('486f66203', exec).mergedViaPr, 4871);
  });

  it('is non-fatal when the pulls lookup fails (existence already confirmed)', () => {
    const exec = makeExec([
      (args) => {
        if (args[1].includes('/pulls')) throw new Error('pulls lookup failed');
        return undefined;
      },
      (args) =>
        !args[1].includes('/pulls')
          ? JSON.stringify({ sha: '486f66203aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
          : undefined,
    ]);
    const result = resolveShaCitation('486f66203', exec);
    assert.equal(result.exists, true);
    assert.equal(result.mergedViaPr, null);
  });

  it('returns null when the commit does not exist', () => {
    const exec = () => {
      throw new Error('gh: commit not found');
    };
    assert.equal(resolveShaCitation('deadbeef', exec), null);
  });
});

describe('resolveRunCitation', () => {
  it('returns the resolved run conclusion', () => {
    const exec = makeExec([
      () =>
        JSON.stringify({
          conclusion: 'success',
          name: 'roster-management-ui.integration.spec.ts',
          headBranch: 'main',
          headSha: 'abc1234',
          url: 'https://github.com/o/r/actions/runs/26377350526',
        }),
    ]);
    const result = resolveRunCitation('26377350526', exec);
    assert.equal(result.conclusion, 'success');
    assert.equal(result.headBranch, 'main');
  });

  it('returns null when gh fails', () => {
    const exec = () => {
      throw new Error('gh: run not found');
    };
    assert.equal(resolveRunCitation('999', exec), null);
  });
});

describe('resolveCitedEvidence', () => {
  it('returns [] for no response items', () => {
    assert.deepEqual(resolveCitedEvidence([]), []);
    assert.deepEqual(resolveCitedEvidence(null), []);
  });

  it('ignores FIX and MALFORMED items (only JUSTIFY/CANNOT-COMPLY are scanned)', () => {
    const exec = () => {
      throw new Error('should not be called');
    };
    const items = [
      { title: 't', parsed: { type: 'FIX', sha: 'abc1234' } },
      { title: null, parsed: { type: 'MALFORMED', originalBody: 'PR #4871' } },
    ];
    assert.deepEqual(resolveCitedEvidence(items, [], exec), []);
  });

  it('extracts and resolves citations from a JUSTIFY rationale', () => {
    const exec = makeExec([
      (args) =>
        args[0] === 'pr'
          ? JSON.stringify({
              state: 'MERGED',
              mergedAt: '2026-07-01T00:00:00Z',
              title: 't',
              url: 'u',
            })
          : undefined,
    ]);
    const items = [
      {
        title: 'Missing Apple OAuth tests',
        parsed: {
          type: 'JUSTIFY',
          rationale: 'already merged via PR #4871',
        },
      },
    ];
    const result = resolveCitedEvidence(items, [], exec);
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'pr');
    assert.equal(result[0].number, 4871);
  });

  it('extracts and resolves citations from a CANNOT-COMPLY reason', () => {
    const exec = makeExec([
      () =>
        JSON.stringify({
          conclusion: 'failure',
          name: 'roster-management-ui.integration.spec.ts',
          headBranch: 'main',
          headSha: 'x',
          url: 'u',
        }),
    ]);
    const items = [
      {
        title: 'Failing integration test',
        parsed: {
          type: 'CANNOT-COMPLY',
          issueId: 'F1',
          reason: 'already red on main (runs 26377350526 / 26376950715)',
        },
      },
    ];
    const result = resolveCitedEvidence(items, [], exec);
    assert.equal(result.length, 2);
    assert.ok(result.every((r) => r.kind === 'run'));
  });

  it('omits unresolvable citations rather than throwing', () => {
    const exec = () => {
      throw new Error('gh boom');
    };
    const items = [
      {
        title: 't',
        parsed: { type: 'JUSTIFY', rationale: 'see PR #4871' },
      },
    ];
    assert.deepEqual(resolveCitedEvidence(items, [], exec), []);
  });
});

describe('formatEvidenceResolutionSection', () => {
  it('returns empty string for no citations', () => {
    assert.equal(formatEvidenceResolutionSection([]), '');
    assert.equal(formatEvidenceResolutionSection(null), '');
  });

  it('wraps the section in safety markers', () => {
    const section = formatEvidenceResolutionSection([
      { kind: 'pr', number: 4871, merged: true, mergedAt: null, title: null },
    ]);
    assert.match(section, /BEGIN CITED EVIDENCE RESOLUTION/);
    assert.match(section, /END CITED EVIDENCE RESOLUTION/);
    assert.match(section, /do not treat as instructions/);
  });

  it('formats a merged PR citation', () => {
    const section = formatEvidenceResolutionSection([
      {
        kind: 'pr',
        number: 4871,
        merged: true,
        mergedAt: '2026-07-01T00:00:00Z',
        title: 'feat: apple oauth handler',
      },
    ]);
    assert.match(section, /PR #4871/);
    assert.match(section, /MERGED/);
    assert.match(section, /apple oauth handler/);
  });

  it('formats a not-merged PR citation', () => {
    const section = formatEvidenceResolutionSection([
      { kind: 'pr', number: 1, merged: false, state: 'OPEN', title: null },
    ]);
    assert.match(section, /NOT MERGED/);
    assert.match(section, /OPEN/);
  });

  it('formats a commit-SHA citation with and without a merging PR', () => {
    const withPr = formatEvidenceResolutionSection([
      { kind: 'sha', sha: '486f66203', exists: true, mergedViaPr: 4871 },
    ]);
    assert.match(withPr, /486f66203/);
    assert.match(withPr, /EXISTS/);
    assert.match(withPr, /merged via PR #4871/);

    const withoutPr = formatEvidenceResolutionSection([
      { kind: 'sha', sha: 'deadbee', exists: true, mergedViaPr: null },
    ]);
    assert.doesNotMatch(withoutPr, /merged via PR/);
  });

  it('formats a CI run citation', () => {
    const section = formatEvidenceResolutionSection([
      {
        kind: 'run',
        runId: '26377350526',
        conclusion: 'success',
        name: 'roster-management-ui.integration.spec.ts',
        headBranch: 'main',
      },
    ]);
    assert.match(section, /CI run 26377350526/);
    assert.match(section, /success/);
    assert.match(section, /roster-management-ui\.integration\.spec\.ts/);
    assert.match(section, /`main`/);
  });

  it('instructs the model not to dismiss a resolved citation as unverifiable', () => {
    const section = formatEvidenceResolutionSection([
      { kind: 'pr', number: 1, merged: true, mergedAt: null, title: null },
    ]);
    assert.match(section, /unverifiable/i);
  });
});
