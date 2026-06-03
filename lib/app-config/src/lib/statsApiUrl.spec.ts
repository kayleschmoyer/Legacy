import { resolveStatsApiUrl } from './statsApiUrl';

// Jest does not provide a global __DEV__; declare it so TypeScript is satisfied
// and tests can assert both branches.
declare const __DEV__: boolean;

// Mock config.native so resolveStatsApiUrl reads from the mock, not process.env.
let mockStatsApiUrl: string | undefined = undefined;
jest.mock('./config.native', () => ({
  get config() {
    return { statsApiUrl: mockStatsApiUrl };
  },
}));

// Mock logging to avoid console noise in tests.
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

describe('resolveStatsApiUrl', () => {
  beforeEach(() => {
    mockStatsApiUrl = undefined;
  });

  describe('when statsApiUrl is configured', () => {
    it('returns the configured URL', () => {
      mockStatsApiUrl = 'https://stats.example.com/career-stats';
      expect(resolveStatsApiUrl('http://localhost:5000/career-stats')).toBe(
        'https://stats.example.com/career-stats',
      );
    });
  });

  describe('when statsApiUrl is not configured', () => {
    it('returns the dev fallback in __DEV__ mode', () => {
      Object.assign(global, { __DEV__: true });
      expect(resolveStatsApiUrl('http://localhost:5000/career-stats')).toBe(
        'http://localhost:5000/career-stats',
      );
    });

    it('throws in release builds', () => {
      Object.assign(global, { __DEV__: false });
      expect(() =>
        resolveStatsApiUrl('http://localhost:5000/career-stats'),
      ).toThrow('Stats API URL is not configured.');
    });
  });
});
