import React from 'react';
import { Text } from 'react-native';
import { router, Stack, Tabs } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import type { ReactNavigationState } from 'expo-router/build/global-state/router-store';
import { navigateFromModal } from './RouteUtils';

/**
 * Routing integration spec for the stack-per-tab navigation (LS-10614,
 * LS-10639). Rather than rendering the real screens (which need Apollo, auth,
 * theme, …), it mounts a minimal in-memory route map with the same shape as
 * `src/app/(app)`: a root `(app)` Stack anchored on `(tabs)`, a Tabs navigator
 * whose five tabs are route groups, one shared-route Stack layout
 * `(home,leagues,players,games,you)` that every drill-down lives under, and a
 * modal (`football/league/create`) on the root Stack outside `(tabs)`.
 *
 * It asserts expo-router's real resolution of pushes, deep links and
 * `navigateFromModal` against that structure, which unit tests with a mocked
 * router cannot.
 */

const TABS = ['home', 'leagues', 'players', 'games', 'you'] as const;
const SHARED = '(app)/(tabs)/(home,leagues,players,games,you)';

const Screen = (name: string) =>
  function TestScreen() {
    return <Text>{name}</Text>;
  };

const routes = {
  '(app)/_layout': {
    default: () => <Stack screenOptions={{ headerShown: false }} />,
    unstable_settings: { initialRouteName: '(tabs)' },
  },
  '(app)/index': Screen('redirect'),
  '(app)/(tabs)/_layout': () => (
    <Tabs screenOptions={{ headerShown: false }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab} name={`(${tab})`} />
      ))}
    </Tabs>
  ),
  [`${SHARED}/_layout`]: {
    default: () => <Stack screenOptions={{ headerShown: false }} />,
    unstable_settings: Object.fromEntries(
      TABS.map((tab) => [tab, { initialRouteName: tab }]),
    ),
  },
  ...Object.fromEntries(
    TABS.map((tab) => [`(app)/(tabs)/(${tab})/${tab}`, Screen(`${tab} tab`)]),
  ),
  [`${SHARED}/football/league/[leagueId]`]: Screen('league detail'),
  '(app)/football/league/create': Screen('create league'),
};

type NavState = Pick<ReactNavigationState, 'routes'>;

/** Depth-first search for the navigator state of the route named `name`. */
function findChildState(
  state: NavState | undefined,
  name: string,
): NavState | undefined {
  for (const route of state?.routes ?? []) {
    const child = route.state as NavState | undefined;
    if (route.name === name) return child;
    const found = findChildState(child, name);
    if (found) return found;
  }
  return undefined;
}

type RenderedRouter = ReturnType<typeof renderRouter>;

/** Route names currently in the stack of the navigator rendered by `name`. */
function stackRouteNames(view: RenderedRouter, name: string) {
  return (
    findChildState(view.getRouterState(), name)?.routes.map((r) => r.name) ?? []
  );
}

describe('stack-per-tab routing (LS-10614)', () => {
  it.each([
    ['/leagues', '(leagues)'],
    ['/home', '(home)'],
  ])(
    'pushes /football/league/5 from %s into the %s tab stack',
    async (initialUrl, group) => {
      const view = renderRouter(routes, { initialUrl });
      expect(view.getPathname()).toBe(initialUrl);

      act(() => router.push('/football/league/5'));

      expect(await screen.findByText('league detail')).toBeTruthy();
      expect(view.getPathname()).toBe('/football/league/5');
      expect(view.getSegments()).toEqual([
        '(app)',
        '(tabs)',
        group,
        'football',
        'league',
        '[leagueId]',
      ]);
    },
  );

  it('opens a cold deep link in the Home tab and goes back to /home', async () => {
    const view = renderRouter(routes, { initialUrl: '/football/league/5' });

    expect(await screen.findByText('league detail')).toBeTruthy();
    expect(view.getSegments().slice(0, 3)).toEqual([
      '(app)',
      '(tabs)',
      '(home)',
    ]);

    act(() => router.back());

    expect(await screen.findByText('home tab')).toBeTruthy();
    expect(view.getPathname()).toBe('/home');
  });

  it('puts /football/league/create on the root (app) Stack, outside (tabs)', async () => {
    const view = renderRouter(routes, { initialUrl: '/leagues' });

    act(() => router.push('/football/league/create'));

    expect(await screen.findByText('create league')).toBeTruthy();
    expect(view.getSegments()).toEqual([
      '(app)',
      'football',
      'league',
      'create',
    ]);
    expect(stackRouteNames(view, '(app)')).toEqual([
      '(tabs)',
      'football/league/create',
    ]);
  });

  it('navigateFromModal from create keeps one (tabs) route and lands in (leagues)', async () => {
    const view = renderRouter(routes, { initialUrl: '/leagues' });
    act(() => router.push('/football/league/create'));
    expect(await screen.findByText('create league')).toBeTruthy();

    act(() => navigateFromModal(router, '/football/league/5'));

    expect(await screen.findByText('league detail')).toBeTruthy();
    expect(view.getPathname()).toBe('/football/league/5');
    expect(view.getSegments().slice(0, 3)).toEqual([
      '(app)',
      '(tabs)',
      '(leagues)',
    ]);
    expect(stackRouteNames(view, '(app)')).toEqual(['(tabs)']);
    expect(stackRouteNames(view, '(leagues)')).toEqual([
      'leagues',
      'football/league/[leagueId]',
    ]);
  });
});
