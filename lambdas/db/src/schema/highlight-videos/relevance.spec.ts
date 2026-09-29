/**
 * Tests for highlight-video title validation (LS-9113):
 *   - normalizeForTitleMatch / matchTitle — the spike's load-bearing
 *     validation rules (40% of raw top hits were wrong-player collisions)
 *   - judgeRelevance — YES/NO parsing and the fail-closed contract
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn(),
}));

import {
  judgeRelevance,
  matchTitle,
  normalizeForTitleMatch,
} from './relevance';

describe('normalizeForTitleMatch', () => {
  it('lowercases, strips diacritics, and collapses punctuation', () => {
    expect(normalizeForTitleMatch('José Ramírez CRUSHES one!')).toBe(
      'jose ramirez crushes one',
    );
    expect(normalizeForTitleMatch('1952WS GM7: Mize gives Yankees lead')).toBe(
      '1952ws gm7 mize gives yankees lead',
    );
  });
});

describe('matchTitle', () => {
  it('classifies a full "First Last" title match', () => {
    expect(
      matchTitle('Jim Thome hits his 600th career home run', 'Jim', 'Thome'),
    ).toBe('full_name');
  });

  it('matches full names across punctuation and diacritics', () => {
    expect(
      matchTitle('Eloy Jiménez SMASHES a grand slam', 'Eloy', 'Jimenez'),
    ).toBe('full_name');
  });

  it('classifies a last-name-only match (archival title shape)', () => {
    expect(
      matchTitle('1952WS GM7: Mize gives Yankees lead', 'Johnny', 'Mize'),
    ).toBe('last_name');
  });

  it('requires whole-word matches — no substring surnames', () => {
    // "Byrd" must not match inside "Byrdak".
    expect(matchTitle('Tim Byrdak strikes out the side', 'Bill', 'Byrd')).toBe(
      'none',
    );
  });

  it('returns none when neither name appears', () => {
    expect(
      matchTitle('Top 10 catches of the 2026 season', 'Burleigh', 'Grimes'),
    ).toBe('none');
  });
});

describe('judgeRelevance', () => {
  const input = {
    videoTitle: 'Marlon Byrd launches a walk-off homer',
    playerName: 'Bill Byrd',
    firstSeason: 1932,
    lastSeason: 1950,
    mlbTeam: null,
  };

  const originalFetch = global.fetch;
  const originalAccountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const originalToken = process.env['CLOUDFLARE_AI_API_TOKEN'];

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'test-account';
    process.env['CLOUDFLARE_AI_API_TOKEN'] = 'test-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env['CLOUDFLARE_ACCOUNT_ID'] = originalAccountId;
    process.env['CLOUDFLARE_AI_API_TOKEN'] = originalToken;
  });

  function mockJudgeResponse(response: string) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { response } }),
    });
  }

  it('accepts on an unambiguous YES', async () => {
    mockJudgeResponse('YES');
    await expect(judgeRelevance(input)).resolves.toBe(true);
  });

  it('rejects on NO', async () => {
    mockJudgeResponse('NO');
    await expect(judgeRelevance(input)).resolves.toBe(false);
  });

  it('fails closed on an ambiguous answer', async () => {
    mockJudgeResponse('It is possible, but unclear.');
    await expect(judgeRelevance(input)).resolves.toBe(false);
  });

  it('fails closed when the API call fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(judgeRelevance(input)).resolves.toBe(false);
  });

  it('fails closed on a non-OK HTTP status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    await expect(judgeRelevance(input)).resolves.toBe(false);
  });
});
