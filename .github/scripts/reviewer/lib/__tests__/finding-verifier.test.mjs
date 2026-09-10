import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCodeSnippets,
  extractFindingShaCitations,
  findingLineContentMatches,
  findingShaCitationsExist,
  filterFabricatedFindings,
} from '../finding-verifier.mjs';

describe('extractCodeSnippets', () => {
  it('extracts backtick-quoted code, excluding path-like spans', () => {
    const f = {
      title: 'Misuse of `LOGGER.error` call signature',
      body: 'Should be `LOGGER.error(msg, err)`, and see `lambdas/db/src/schema/commissioner-tools.ts` for context.',
    };
    const snippets = extractCodeSnippets(f);
    assert.ok(snippets.includes('LOGGER.error'));
    assert.ok(snippets.includes('LOGGER.error(msg, err)'));
    assert.ok(!snippets.some((s) => s.includes('/')));
  });
});

describe('extractFindingShaCitations', () => {
  it('extracts hex SHAs containing at least one a-f letter', () => {
    const f = { title: 'Regression', body: 'Introduced in commit a1b2c3d.' };
    assert.deepEqual(extractFindingShaCitations(f), ['a1b2c3d']);
  });

  it('ignores pure-digit runs (line numbers, counts)', () => {
    const f = { title: 'x', body: 'See lines 761, 772, 790, 798.' };
    assert.deepEqual(extractFindingShaCitations(f), []);
  });
});

describe('findingLineContentMatches', () => {
  // Fixture mirrors the exact LS-9729 / PR #7387 regression: the Reviewer Bot
  // cited LOGGER.error misuse at lines 761, 772, 790, 798 of
  // commissioner-tools.ts, but the file's actual content at those lines has
  // nothing to do with LOGGER.error — the real (and only) LOGGER.error call
  // in that file is at a different line entirely.
  const commissionerToolsLines = {
    761: '          weekNumber: PublicSchema.matchups.weekNumber,',
    772: "              : 'No matchups found to recalculate for this league.',",
    790: '      };',
    798: '          const playerGameStatsResult = await getMatchupPlayerGameStats(',
    832: '          LOGGER.error(',
  };
  const getLine = (path, line) =>
    path === 'lambdas/db/src/schema/commissioner-tools.ts'
      ? (commissionerToolsLines[line] ?? null)
      : null;

  it('flags a fabricated line citation for each of the four reported lines', () => {
    for (const line of [761, 772, 790, 798]) {
      const finding = {
        severity: 'high',
        file: 'lambdas/db/src/schema/commissioner-tools.ts',
        line,
        title: 'Misuse of `LOGGER.error`',
        body: 'This line calls `LOGGER.error` with the wrong argument order.',
      };
      assert.equal(
        findingLineContentMatches(finding, getLine),
        false,
        `line ${line} should be flagged as fabricated`,
      );
    }
  });

  it('does not flag a finding whose cited line genuinely contains the quoted pattern', () => {
    const finding = {
      severity: 'high',
      file: 'lambdas/db/src/schema/commissioner-tools.ts',
      line: 832,
      title: 'Misuse of `LOGGER.error`',
      body: 'This call to `LOGGER.error` swallows the stack trace.',
    };
    assert.equal(findingLineContentMatches(finding, getLine), true);
  });

  it('flags a line number that does not exist in the file', () => {
    const finding = {
      file: 'lambdas/db/src/schema/commissioner-tools.ts',
      line: 99999,
      title: 'x',
      body: 'Calls `LOGGER.error` incorrectly.',
    };
    assert.equal(findingLineContentMatches(finding, getLine), false);
  });

  it('passes through findings with no quoted code snippet (nothing to disprove)', () => {
    const finding = {
      file: 'lambdas/db/src/schema/commissioner-tools.ts',
      line: 761,
      title: 'Consider renaming this variable',
      body: 'No backtick snippet here at all.',
    };
    assert.equal(findingLineContentMatches(finding, getLine), true);
  });

  it('passes through PR-level findings with no file/line', () => {
    const finding = { file: null, line: null, title: 'x', body: '`foo`' };
    assert.equal(findingLineContentMatches(finding, getLine), true);
  });
});

describe('findingShaCitationsExist', () => {
  it('flags a placeholder-looking SHA that git cannot resolve', () => {
    const commitExists = () => false;
    const finding = {
      title: 'Regression',
      body: 'This bug was introduced in commit a1b2c3d.',
    };
    assert.equal(findingShaCitationsExist(finding, commitExists), false);
  });

  it('does not flag a SHA that git resolves to a real commit', () => {
    const commitExists = (sha) => sha === 'deadbeef1234567';
    const finding = {
      title: 'Regression',
      body: 'Introduced in commit deadbeef1234567.',
    };
    assert.equal(findingShaCitationsExist(finding, commitExists), true);
  });

  it('passes through findings that cite no SHA at all', () => {
    const commitExists = () => {
      throw new Error('should not be called');
    };
    assert.equal(
      findingShaCitationsExist(
        { title: 'x', body: 'no sha here' },
        commitExists,
      ),
      true,
    );
  });
});

describe('filterFabricatedFindings', () => {
  it('strips the exact LS-9729 regression finding: fabricated lines + placeholder SHA', () => {
    const commissionerToolsLines = {
      761: '          weekNumber: PublicSchema.matchups.weekNumber,',
    };
    const getLine = (path, line) =>
      path === 'lambdas/db/src/schema/commissioner-tools.ts'
        ? (commissionerToolsLines[line] ?? null)
        : null;
    const commitExists = () => false; // a1b2c3d is a stock placeholder, not a real commit

    const findings = [
      {
        severity: 'high',
        file: 'lambdas/db/src/schema/commissioner-tools.ts',
        line: 761,
        title: 'Misuse of `LOGGER.error`',
        body: 'Incorrect argument order for `LOGGER.error`. Introduced in commit a1b2c3d.',
      },
    ];

    const { kept, stripped } = filterFabricatedFindings(findings, {
      getLine,
      commitExists,
    });
    assert.equal(kept.length, 0);
    assert.equal(stripped.length, 1);
    assert.equal(stripped[0].strip_reason, 'fabricated_line_content');
  });

  it('strips a finding solely for a fabricated SHA when the line content is real', () => {
    const getLine = () => 'LOGGER.error(';
    const commitExists = () => false;
    const findings = [
      {
        severity: 'high',
        file: 'lambdas/db/src/schema/commissioner-tools.ts',
        line: 832,
        title: 'Misuse of `LOGGER.error`',
        body: 'Regression from commit a1b2c3d — see `LOGGER.error` call.',
      },
    ];
    const { kept, stripped } = filterFabricatedFindings(findings, {
      getLine,
      commitExists,
    });
    assert.equal(kept.length, 0);
    assert.equal(stripped[0].strip_reason, 'fabricated_commit_sha');
  });

  it('keeps a legitimate finding whose citations are all real', () => {
    const getLine = () => 'LOGGER.error(';
    const commitExists = (sha) => sha === 'deadbeef1234567';
    const findings = [
      {
        severity: 'medium',
        file: 'lambdas/db/src/schema/commissioner-tools.ts',
        line: 832,
        title: 'Misuse of `LOGGER.error`',
        body: 'This `LOGGER.error` call swallows context. See commit deadbeef1234567.',
      },
    ];
    const { kept, stripped } = filterFabricatedFindings(findings, {
      getLine,
      commitExists,
    });
    assert.equal(stripped.length, 0);
    assert.equal(kept.length, 1);
  });
});
