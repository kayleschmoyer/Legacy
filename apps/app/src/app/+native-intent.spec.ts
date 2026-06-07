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
});
