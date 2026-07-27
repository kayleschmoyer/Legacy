import {
  buildJiraLinkBlock,
  buildJiraLinkComment,
  ensureJiraLinkMarker,
  ensureTitleHasPrimaryKey,
  extractPrimaryKey,
  hasJiraLinkMarker,
  isValidPrimary,
  parseRelatedKeys,
} from './jira-link';

describe('jira-link marker (LS-7895)', () => {
  describe('extractPrimaryKey', () => {
    it('returns the first LS-#### key in a PR title', () => {
      expect(extractPrimaryKey('LS-7895 feat(mcp): emit marker')).toBe(
        'LS-7895',
      );
    });

    it('returns the first key when several are present', () => {
      expect(extractPrimaryKey('LS-1 relates to LS-2')).toBe('LS-1');
    });

    it('returns null when no key is present (bot/dependabot titles)', () => {
      expect(
        extractPrimaryKey('chore(deps): bump lodash from 4.17.20 to 4.17.21'),
      ).toBeNull();
    });

    it('does not match key-like substrings inside words', () => {
      expect(extractPrimaryKey('FOOLS-123 nope')).toBeNull();
    });
  });

  describe('isValidPrimary', () => {
    it.each(['LS-1', 'LS-7895', 'none'])('accepts %s', (v) => {
      expect(isValidPrimary(v)).toBe(true);
    });

    it.each(['ls-1', 'None', 'LS-', 'LS-1, LS-2', ''])('rejects %s', (v) => {
      expect(isValidPrimary(v)).toBe(false);
    });
  });

  describe('parseRelatedKeys', () => {
    it('parses a comma/space-separated string', () => {
      expect(parseRelatedKeys('LS-1, LS-2 LS-3')).toEqual([
        'LS-1',
        'LS-2',
        'LS-3',
      ]);
    });

    it('parses an array and dedupes', () => {
      expect(parseRelatedKeys(['LS-1', 'LS-1', 'LS-2'])).toEqual([
        'LS-1',
        'LS-2',
      ]);
    });

    it('returns [] for undefined or empty input', () => {
      expect(parseRelatedKeys(undefined)).toEqual([]);
      expect(parseRelatedKeys('')).toEqual([]);
      expect(parseRelatedKeys([])).toEqual([]);
    });

    it('throws on a non-key token', () => {
      expect(() => parseRelatedKeys('LS-1, garbage')).toThrow(
        /Invalid related Jira key/,
      );
    });
  });

  describe('buildJiraLinkBlock', () => {
    it('emits the RFC marker format: comment + visible line', () => {
      expect(buildJiraLinkBlock({ primary: 'LS-7523' })).toBe(
        '<!-- jira-link\n' +
          'primary: LS-7523\n' +
          '-->\n\n' +
          '**Jira:** [LS-7523](https://bkrupa.atlassian.net/browse/LS-7523)',
      );
    });

    it('includes related keys in the comment only', () => {
      const block = buildJiraLinkBlock({
        primary: 'LS-7523',
        related: ['LS-7520', 'LS-7521'],
      });
      expect(block).toContain('related: LS-7520, LS-7521');
      // Visible line links the primary only — related keys are informational.
      expect(block).toContain('**Jira:** [LS-7523]');
      expect(block).not.toContain('[LS-7520]');
    });

    it('emits comment only (no visible line) for primary: none', () => {
      const block = buildJiraLinkBlock({ primary: 'none' });
      expect(block).toBe('<!-- jira-link\nprimary: none\n-->');
      expect(block).not.toContain('**Jira:**');
    });
  });

  describe('ensureJiraLinkMarker', () => {
    it('prepends the full block to a body without a Jira line', () => {
      const result = ensureJiraLinkMarker('## Summary\n\n- did things', {
        primary: 'LS-7895',
      });
      expect(result.startsWith('<!-- jira-link\nprimary: LS-7895\n-->')).toBe(
        true,
      );
      expect(result).toContain('**Jira:** [LS-7895]');
      expect(result).toContain('## Summary');
    });

    it('prepends comment only when the body already has a visible **Jira:** line', () => {
      const body =
        '## Context\n\n**Jira:** [LS-7895](https://bkrupa.atlassian.net/browse/LS-7895)\n\nstuff';
      const result = ensureJiraLinkMarker(body, { primary: 'LS-7895' });
      expect(hasJiraLinkMarker(result)).toBe(true);
      // Exactly one visible Jira line — no duplicate.
      expect(result.match(/\*\*Jira:\*\*/g)).toHaveLength(1);
    });

    it('is a no-op when the body already carries a marker', () => {
      const body =
        '<!-- jira-link\nprimary: LS-1\n-->\n\n**Jira:** [LS-1](https://bkrupa.atlassian.net/browse/LS-1)\n\nbody';
      expect(ensureJiraLinkMarker(body, { primary: 'LS-2' })).toBe(body);
    });

    it('does not treat decoy LS-#### keys in prose as a marker', () => {
      const body = 'Mentions LS-1234 in prose but has no marker.';
      const result = ensureJiraLinkMarker(body, { primary: 'LS-9' });
      expect(result).toContain('primary: LS-9');
    });

    it('prepends marker when body mentions the marker only in a backtick code span (LS-7914)', () => {
      const body =
        'Use `<!-- jira-link -->` in your PR body to link a ticket.\n\n## Summary\n\n- did things';
      const result = ensureJiraLinkMarker(body, { primary: 'LS-7914' });
      expect(result.startsWith('<!-- jira-link\nprimary: LS-7914\n-->')).toBe(
        true,
      );
      expect(result).toContain('Use `<!-- jira-link -->`');
    });

    it('prepends marker when body mentions the marker only in a fenced code block (LS-7914)', () => {
      const body =
        '```\n<!-- jira-link\nprimary: LS-1\n-->\n```\n\n## Summary\n\n- did things';
      const result = ensureJiraLinkMarker(body, { primary: 'LS-7914' });
      expect(result.startsWith('<!-- jira-link\nprimary: LS-7914\n-->')).toBe(
        true,
      );
    });
  });

  describe('hasJiraLinkMarker (LS-7914)', () => {
    it('returns false when marker appears only inside a backtick code span', () => {
      expect(
        hasJiraLinkMarker('Use `<!-- jira-link -->` in your PR body.'),
      ).toBe(false);
    });

    it('returns false when marker appears only inside a fenced code block', () => {
      expect(
        hasJiraLinkMarker(
          '```\n<!-- jira-link\nprimary: LS-1\n-->\n```\n\nSome prose.',
        ),
      ).toBe(false);
    });

    it('returns true when a real marker is present (no-op preserved)', () => {
      expect(
        hasJiraLinkMarker(
          '<!-- jira-link\nprimary: LS-1\n-->\n\n**Jira:** [LS-1](https://bkrupa.atlassian.net/browse/LS-1)',
        ),
      ).toBe(true);
    });

    it('returns true when a real marker is present alongside a quoted decoy (no-op preserved)', () => {
      const body =
        '<!-- jira-link\nprimary: LS-1\n-->\n\nMentions `<!-- jira-link -->` in prose.';
      expect(hasJiraLinkMarker(body)).toBe(true);
    });
  });

  describe('ensureTitleHasPrimaryKey (LS-8679)', () => {
    it('prepends the primary key when the title lacks it', () => {
      expect(
        ensureTitleHasPrimaryKey('fix(web): validate JWT payload', 'LS-8537'),
      ).toBe('LS-8537 fix(web): validate JWT payload');
    });

    it('is a no-op when the title already starts with the primary key', () => {
      expect(
        ensureTitleHasPrimaryKey(
          'LS-8537 fix(web): validate JWT payload',
          'LS-8537',
        ),
      ).toBe('LS-8537 fix(web): validate JWT payload');
    });

    it('is a no-op when the primary key appears anywhere in the title (satisfies jira-link-check.mjs)', () => {
      expect(
        ensureTitleHasPrimaryKey(
          'fix(web): LS-8537 validate JWT payload',
          'LS-8537',
        ),
      ).toBe('fix(web): LS-8537 validate JWT payload');
    });

    it('is a no-op when primary is "none"', () => {
      expect(ensureTitleHasPrimaryKey('chore(deps): bump lodash', 'none')).toBe(
        'chore(deps): bump lodash',
      );
    });
  });

  describe('buildJiraLinkComment', () => {
    it('omits the related line when there are no related keys', () => {
      expect(buildJiraLinkComment({ primary: 'LS-1', related: [] })).toBe(
        '<!-- jira-link\nprimary: LS-1\n-->',
      );
    });
  });
});
