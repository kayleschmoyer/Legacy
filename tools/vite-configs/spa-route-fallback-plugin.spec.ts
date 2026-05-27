/**
 * Tests for the SPA route fallback Vite plugin.
 *
 * Run with: pnpm exec jest --config tools/vite-configs/jest.config.ts tools/vite-configs/spa-route-fallback-plugin.spec.ts
 */

import {
  extractStaticRoutes,
  spaRouteFallbackPlugin,
} from './spa-route-fallback-plugin';

describe('extractStaticRoutes', () => {
  it('returns static top-level routes from React Router source', () => {
    const source = `
      <Route path="/scoreboard" element={<ScoreboardPage />} />
      <Route path="/players" element={<PlayersScreen />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
    `;
    expect(extractStaticRoutes(source)).toEqual([
      '/players',
      '/scoreboard',
      '/terms',
    ]);
  });

  it('excludes the root path', () => {
    const source = `<Route path="/" element={<Home />} />`;
    expect(extractStaticRoutes(source)).toEqual([]);
  });

  it('excludes routes with dynamic segments', () => {
    const source = `
      <Route path="/players/:id" element={<PlayerDetail />} />
      <Route path="/baseball/league/:id/:tab" element={<LeagueDetail />} />
    `;
    expect(extractStaticRoutes(source)).toEqual([]);
  });

  it('excludes wildcard routes', () => {
    const source = `<Route path="/*" element={<NotFound />} />`;
    expect(extractStaticRoutes(source)).toEqual([]);
  });

  it('keeps static parent of a parameterized sibling', () => {
    const source = `
      <Route path="/players" element={<PlayersScreen />} />
      <Route path="/players/:id" element={<PlayerDetail />} />
      <Route path="/players/stats" element={<PlayerStats />} />
    `;
    expect(extractStaticRoutes(source)).toEqual(['/players', '/players/stats']);
  });

  it('deduplicates repeated paths', () => {
    const source = `
      <Route path="/scoreboard" element={<A />} />
      <Route path="/scoreboard" element={<B />} />
    `;
    expect(extractStaticRoutes(source)).toEqual(['/scoreboard']);
  });

  it('handles single-quoted paths', () => {
    const source = `<Route path='/about' element={<About />} />`;
    expect(extractStaticRoutes(source)).toEqual(['/about']);
  });

  it('strips trailing slashes', () => {
    const source = `<Route path="/help/" element={<Help />} />`;
    expect(extractStaticRoutes(source)).toEqual(['/help']);
  });
});

describe('spaRouteFallbackPlugin', () => {
  it('declares the expected plugin shape', () => {
    const plugin = spaRouteFallbackPlugin({ routesFile: 'src/app/app.tsx' });
    expect(plugin.name).toBe('spa-route-fallback');
    expect(plugin.apply).toBe('build');
    expect(typeof plugin.closeBundle).toBe('function');
    expect(typeof plugin.configResolved).toBe('function');
  });
});
