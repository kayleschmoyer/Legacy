import React from 'react';
import { render } from '@testing-library/react-native';
import { colors } from '@legacy-sports/design-tokens';
import fs from 'fs';
import path from 'path';

// ── Import the component under test ──────────────────────────────────────────
import TabStackLayout, { unstable_settings } from './_layout';

// ── Mocks ────────────────────────────────────────────────────────────────────

const TOP_INSET = 42;

type ScreenOptionsFn = (props: {
  route: { name: string };
}) => Record<string, unknown>;

/** The Stack's `screenOptions`, captured on render. */
const mockNav: { screenOptions?: ScreenOptionsFn } = {};

jest.mock('expo-router', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Stack: ({ screenOptions }: { screenOptions?: ScreenOptionsFn }) => {
      mockNav.screenOptions = screenOptions;
      return <View testID="tab-stack" />;
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 42, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../../../../context/ThemeContext', () => ({
  useThemeContext: () => ({
    resolvedTheme: 'dark',
    themePreference: 'system',
    setThemePreference: jest.fn(),
  }),
}));

function optionsFor(routeName: string): Record<string, unknown> {
  render(<TabStackLayout />);
  if (!mockNav.screenOptions) throw new Error('Stack was not rendered');
  return mockNav.screenOptions({ route: { name: routeName } });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('per-tab Stack layout (LS-10614)', () => {
  const TABS = ['home', 'leagues', 'players', 'games', 'you'];

  it('roots each tab group at its own tab screen', () => {
    expect(unstable_settings).toEqual(
      Object.fromEntries(TABS.map((t) => [t, { initialRouteName: t }])),
    );
  });

  it('keeps every screen headerless (LS-8766)', () => {
    expect(optionsFor('football/league/[leagueId]').headerShown).toBe(false);
    expect(optionsFor('home').headerShown).toBe(false);
  });

  it('pads pushed screens by the top safe-area inset', () => {
    expect(optionsFor('football/league/[leagueId]').contentStyle).toEqual({
      backgroundColor: colors.dark.surface.bg,
      paddingTop: TOP_INSET,
    });
  });

  it('leaves tab roots unpadded — they read the inset themselves', () => {
    for (const tab of TABS) {
      expect(optionsFor(tab).contentStyle).toEqual({
        backgroundColor: colors.dark.surface.bg,
      });
    }
  });
});

/**
 * Placement is the whole feature: a route under this shared group keeps the
 * tab bar, a route on the root `(app)` Stack hides it. Pin both lists so a
 * future screen can't silently land on the wrong side.
 */
describe('route placement', () => {
  const SHARED_DIR = __dirname;
  const APP_DIR = path.resolve(__dirname, '../..');

  const exists = (dir: string, route: string) =>
    ['.tsx', '.ts'].some((ext) => fs.existsSync(path.join(dir, route + ext)));

  it.each([
    'football/league/[leagueId]',
    'baseball/league/[leagueId]',
    'football/team/[teamId]',
    'baseball/team/[teamId]',
    'football/players/[playerId]',
    'football/players',
    'baseball/players',
    'football/matchup',
    'baseball/matchup',
    'baseball/scoreboard',
    'PlayerDetail',
    'PlayerStats',
    'PlayerComparison',
    'FreeAgents',
    'WaiversPage',
    'DirectMessages',
    'management',
    'notifications',
    'preferences',
    'profile-settings',
    'help',
    'about',
    'mock-drafts',
    'season-draft/index',
  ])('%s keeps the tab bar (lives in the per-tab stacks)', (route) => {
    expect(exists(SHARED_DIR, route)).toBe(true);
    expect(exists(APP_DIR, route)).toBe(false);
  });

  it.each([
    'DraftBoardPage',
    'DraftWatchPage',
    'mock-draft/[draftId]',
    'baseball/mock-draft',
    'baseball/mock-draft-join',
    'league/create',
    'league/join',
    'football/league/create',
    'football/league/join',
    'baseball/league/create',
    'baseball/league/join',
    'join/index',
    'join/[code]',
    'season-draft/create',
    'season-draft/join',
    'season-draft/[gameId]',
    'games/twenty-questions',
    'disclosure-game/index',
    // A paywall, opened mid-flow from Create League / Mock Draft — modal so
    // the in-progress flow survives underneath it.
    'subscription-settings',
  ])('%s hides the tab bar (lives on the root stack)', (route) => {
    expect(exists(APP_DIR, route)).toBe(true);
    expect(exists(SHARED_DIR, route)).toBe(false);
  });
});
