import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAuthorReply,
  isShaInPrHistory,
  FORMAT_ERROR_MESSAGE,
} from '../parse-author-response.mjs';

describe('parseAuthorReply — FIX token', () => {
  it('parses a valid FIX: sha', () => {
    assert.deepStrictEqual(parseAuthorReply('FIX: abc1234'), {
      type: 'FIX',
      sha: 'abc1234',
    });
  });

  it('parses FIX with full 40-char SHA', () => {
    const sha = 'a'.repeat(40);
    assert.deepStrictEqual(parseAuthorReply(`FIX: ${sha}`), {
      type: 'FIX',
      sha,
    });
  });

  it('trims leading/trailing whitespace from body before parsing', () => {
    assert.deepStrictEqual(parseAuthorReply('  FIX: abc1234  \n'), {
      type: 'FIX',
      sha: 'abc1234',
    });
  });

  it('allows extra lines after FIX: sha (author commentary)', () => {
    const result = parseAuthorReply('FIX: abc1234\n\nFixed the broken loop.');
    assert.deepStrictEqual(result, { type: 'FIX', sha: 'abc1234' });
  });

  it('rejects FIX: with no sha', () => {
    assert.strictEqual(parseAuthorReply('FIX:').type, 'MALFORMED');
  });

  it('rejects FIX: with only whitespace after colon', () => {
    assert.strictEqual(parseAuthorReply('FIX:   ').type, 'MALFORMED');
  });

  it('rejects FIX: with multiple tokens on the first line', () => {
    assert.strictEqual(
      parseAuthorReply('FIX: abc1234 def5678').type,
      'MALFORMED',
    );
  });
});

describe('parseAuthorReply — JUSTIFY token', () => {
  it('parses a single-line rationale', () => {
    assert.deepStrictEqual(parseAuthorReply('JUSTIFY: This is intentional.'), {
      type: 'JUSTIFY',
      rationale: 'This is intentional.',
    });
  });

  it('parses a multi-line rationale', () => {
    const body = 'JUSTIFY: Line 1\nLine 2\nLine 3';
    assert.deepStrictEqual(parseAuthorReply(body), {
      type: 'JUSTIFY',
      rationale: 'Line 1\nLine 2\nLine 3',
    });
  });

  it('trims trailing whitespace from rationale', () => {
    const result = parseAuthorReply('JUSTIFY: reason  ');
    assert.strictEqual(result.type, 'JUSTIFY');
    assert.strictEqual(/** @type {any} */ (result).rationale, 'reason');
  });

  it('rejects JUSTIFY: with no rationale', () => {
    assert.strictEqual(parseAuthorReply('JUSTIFY:').type, 'MALFORMED');
  });

  it('rejects JUSTIFY: with only whitespace rationale', () => {
    assert.strictEqual(parseAuthorReply('JUSTIFY:   ').type, 'MALFORMED');
  });
});

describe('parseAuthorReply — CANNOT-COMPLY token', () => {
  it('parses with issue-id and single-line reason', () => {
    assert.deepStrictEqual(
      parseAuthorReply('CANNOT-COMPLY: LS-1234\nThis is impossible to fix.'),
      {
        type: 'CANNOT-COMPLY',
        issueId: 'LS-1234',
        reason: 'This is impossible to fix.',
      },
    );
  });

  it('parses with multi-line reason', () => {
    const body = 'CANNOT-COMPLY: LS-1234\nReason line 1\nReason line 2';
    assert.deepStrictEqual(parseAuthorReply(body), {
      type: 'CANNOT-COMPLY',
      issueId: 'LS-1234',
      reason: 'Reason line 1\nReason line 2',
    });
  });

  it('rejects CANNOT-COMPLY with no newline (missing reason)', () => {
    assert.strictEqual(
      parseAuthorReply('CANNOT-COMPLY: LS-1234').type,
      'MALFORMED',
    );
  });

  it('rejects CANNOT-COMPLY with no issue-id', () => {
    assert.strictEqual(
      parseAuthorReply('CANNOT-COMPLY:\nNo id here').type,
      'MALFORMED',
    );
  });
});

describe('parseAuthorReply — MALFORMED', () => {
  it('treats unrecognized text as MALFORMED', () => {
    const result = parseAuthorReply('This is a random reply');
    assert.strictEqual(result.type, 'MALFORMED');
    assert.strictEqual(
      /** @type {any} */ (result).originalBody,
      'This is a random reply',
    );
  });

  it('treats an empty string as MALFORMED', () => {
    assert.strictEqual(parseAuthorReply('').type, 'MALFORMED');
  });

  it('treats whitespace-only body as MALFORMED', () => {
    assert.strictEqual(parseAuthorReply('   \n  ').type, 'MALFORMED');
  });

  it('treats lowercase "fix:" as MALFORMED (case-sensitive)', () => {
    assert.strictEqual(parseAuthorReply('fix: abc1234').type, 'MALFORMED');
  });

  it('treats lowercase "justify:" as MALFORMED (case-sensitive)', () => {
    assert.strictEqual(parseAuthorReply('justify: reason').type, 'MALFORMED');
  });
});

describe('FORMAT_ERROR_MESSAGE', () => {
  it('matches the spec-mandated wording exactly', () => {
    assert.strictEqual(
      FORMAT_ERROR_MESSAGE,
      'Format error. Expected "FIX: <sha>" or "JUSTIFY: <rationale>". Your reply was treated as unaddressed.',
    );
  });
});

describe('isShaInPrHistory', () => {
  const commits = [
    'abc1234567890abcdef1234567890abcdef123456',
    'def5678901234def5678901234def567890123456',
  ];

  it('returns true for an exact full SHA match', () => {
    assert.strictEqual(
      isShaInPrHistory('abc1234567890abcdef1234567890abcdef123456', commits),
      true,
    );
  });

  it('returns true for a valid abbreviated SHA prefix', () => {
    assert.strictEqual(isShaInPrHistory('abc1234', commits), true);
  });

  it('returns false for a SHA not in history', () => {
    assert.strictEqual(isShaInPrHistory('999aaaa', commits), false);
  });

  it('is case-insensitive', () => {
    assert.strictEqual(isShaInPrHistory('ABC1234', commits), true);
  });

  it('returns false for empty commits list', () => {
    assert.strictEqual(isShaInPrHistory('abc1234', []), false);
  });

  it('returns false for an empty sha string', () => {
    assert.strictEqual(isShaInPrHistory('', commits), false);
  });
});
