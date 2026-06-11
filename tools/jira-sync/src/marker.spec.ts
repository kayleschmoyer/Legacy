import { parseMarker } from './marker';
import { extractKeys } from './keys';

describe('extractKeys', () => {
  it('extracts, uppercases, dedupes, and sorts keys', () => {
    expect(extractKeys('ls-12/foo-LS-9-bar-LS-12')).toEqual(['LS-12', 'LS-9']);
  });

  it('returns empty for null, undefined, and keyless text', () => {
    expect(extractKeys(null)).toEqual([]);
    expect(extractKeys(undefined)).toEqual([]);
    expect(extractKeys('claude/hopeful-darwin-nt7z6b')).toEqual([]);
  });
});

describe('parseMarker', () => {
  it('parses a valid block with primary and related', () => {
    const body = [
      'Some prose first.',
      '',
      '<!-- jira-link',
      'primary: LS-7523',
      'related: LS-7520, ls-7521',
      '-->',
      '',
      '**Jira:** [LS-7523](https://bkrupa.atlassian.net/browse/LS-7523)',
    ].join('\n');
    expect(parseMarker(body)).toEqual({
      present: true,
      valid: true,
      primary: 'LS-7523',
      related: ['LS-7520', 'LS-7521'],
    });
  });

  it('parses a primary-only block', () => {
    const result = parseMarker('<!-- jira-link\nprimary: LS-1\n-->');
    expect(result).toMatchObject({
      present: true,
      valid: true,
      primary: 'LS-1',
      related: [],
    });
  });

  it('reports absent when there is no block', () => {
    expect(parseMarker('closes LS-1234 in prose only')).toMatchObject({
      present: false,
      valid: false,
      primary: null,
    });
    expect(parseMarker('')).toMatchObject({ present: false });
    expect(parseMarker(undefined)).toMatchObject({ present: false });
  });

  it('ignores decoy LS-#### keys outside the marker', () => {
    const body = [
      'unblocks LS-9999 and mentions LS-8888',
      '<!-- jira-link',
      'primary: LS-7523',
      '-->',
      'also LS-7777 down here',
    ].join('\n');
    expect(parseMarker(body)).toMatchObject({
      valid: true,
      primary: 'LS-7523',
    });
  });

  it('treats primary: none as a valid explicit opt-out', () => {
    const result = parseMarker('<!-- jira-link\nprimary: none\n-->');
    expect(result).toMatchObject({ present: true, valid: true, primary: null });
  });

  it('rejects multiple primary declarations', () => {
    const result = parseMarker(
      '<!-- jira-link\nprimary: LS-1\nprimary: LS-2\n-->',
    );
    expect(result).toMatchObject({ present: true, valid: false });
    expect(result.error).toContain('more than one primary');
  });

  it('rejects a missing primary field', () => {
    const result = parseMarker('<!-- jira-link\nrelated: LS-1\n-->');
    expect(result).toMatchObject({ present: true, valid: false });
    expect(result.error).toContain('no primary');
  });

  it('rejects malformed content', () => {
    expect(
      parseMarker('<!-- jira-link\nthis is not a field\n-->'),
    ).toMatchObject({
      present: true,
      valid: false,
    });
    expect(
      parseMarker('<!-- jira-link\nprimary: not-a-key\n-->'),
    ).toMatchObject({
      present: true,
      valid: false,
    });
    expect(
      parseMarker('<!-- jira-link\nprimary: LS-1 LS-2\n-->'),
    ).toMatchObject({
      present: true,
      valid: false,
    });
    expect(
      parseMarker('<!-- jira-link\nprimary: LS-1\nbogus: x\n-->'),
    ).toMatchObject({
      present: true,
      valid: false,
    });
    expect(
      parseMarker('<!-- jira-link\nrelated: LS-1, nope\nprimary: LS-2\n-->'),
    ).toMatchObject({
      present: true,
      valid: false,
    });
  });
});
