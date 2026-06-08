import { redirectSystemPath } from './+native-intent';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('redirectSystemPath', () => {
  it('rewrites the web-style invite path to the native route + query param', () => {
    expect(
      redirectSystemPath({
        path: '/games/season-draft/join/ABC123',
        initial: true,
      }),
    ).toBe('/season-draft/join?inviteCode=ABC123');
  });

  it('rewrites the native-style invite path to the query param form', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/join/XYZ789', initial: false }),
    ).toBe('/season-draft/join?inviteCode=XYZ789');
  });

  it('ignores a trailing slash and existing query/hash on the path', () => {
    expect(
      redirectSystemPath({
        path: '/games/season-draft/join/ABC123/?ref=email#top',
        initial: true,
      }),
    ).toBe('/season-draft/join?inviteCode=ABC123');
  });

  it('encodes invite codes containing special characters', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/join/a b&c', initial: true }),
    ).toBe('/season-draft/join?inviteCode=a%20b%26c');
  });

  it('passes through unrelated paths unchanged', () => {
    expect(
      redirectSystemPath({ path: '/season-draft/42', initial: true }),
    ).toBe('/season-draft/42');
    expect(
      redirectSystemPath({ path: '/season-draft/join', initial: true }),
    ).toBe('/season-draft/join');
  });

  it('rewrites baseball league trades path to flat route with initialTab query param', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/trades',
        initial: true,
      }),
    ).toBe('/baseball/league/123?initialTab=trades');
  });

  it('rewrites football league trades path to flat route with initialTab query param', () => {
    expect(
      redirectSystemPath({
        path: '/football/league/456/trades',
        initial: false,
      }),
    ).toBe('/football/league/456?initialTab=trades');
  });

  it('rewrites league trades path with a trailing slash', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/789/trades/',
        initial: false,
      }),
    ).toBe('/baseball/league/789?initialTab=trades');
  });

  it('preserves existing query params when rewriting trade paths', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/trades?ref=push',
        initial: true,
      }),
    ).toBe('/baseball/league/123?ref=push&initialTab=trades');
  });

  it('passes through non-trades league sub-paths unchanged', () => {
    expect(
      redirectSystemPath({
        path: '/baseball/league/123/roster',
        initial: false,
      }),
    ).toBe('/baseball/league/123/roster');
    expect(
      redirectSystemPath({ path: '/baseball/league/123', initial: false }),
    ).toBe('/baseball/league/123');
  });
});
