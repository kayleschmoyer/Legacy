/**
 * Sports Feature Infrastructure Tests
 *
 * Validates that sports-specific screens and components are properly
 * structured for E2E testing. Verifies file existence, component exports,
 * and testID conventions for football and baseball features.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_SRC = path.resolve(__dirname, '../../app/src');

describe('Sports Feature Infrastructure', () => {
  describe('Football Features', () => {
    it('should have football screen component', () => {
      const footballPath = path.join(APP_SRC, 'app/(app)/football/index.tsx');
      expect(fs.existsSync(footballPath)).toBe(true);

      const content = fs.readFileSync(footballPath, 'utf8');
      expect(content).toContain('export default');
    });

    it('should expose the football home route to the file-based router', () => {
      // LS-8766 removed the per-route <Stack.Screen> entries (they only set
      // header options, and the group is now headerless); expo-router registers
      // these routes from the filesystem instead.
      const footballPath = path.join(APP_SRC, 'app/(app)/football/index.tsx');
      expect(fs.existsSync(footballPath)).toBe(true);
    });
  });

  describe('Baseball Features', () => {
    it('should have baseball screen component', () => {
      const baseballPath = path.join(APP_SRC, 'app/(app)/baseball/index.tsx');
      expect(fs.existsSync(baseballPath)).toBe(true);

      const content = fs.readFileSync(baseballPath, 'utf8');
      expect(content).toContain('export default');
    });

    it('should expose the baseball home route to the file-based router', () => {
      const baseballPath = path.join(APP_SRC, 'app/(app)/baseball/index.tsx');
      expect(fs.existsSync(baseballPath)).toBe(true);
    });

    it('should have league management screens', () => {
      const leagueScreens = [
        'app/(app)/baseball/league/[leagueId].tsx',
        'app/(app)/baseball/league/create.tsx',
        'app/(app)/baseball/league/join.tsx',
        'app/(app)/baseball/team/[teamId].tsx',
      ];

      for (const screen of leagueScreens) {
        const screenPath = path.join(APP_SRC, screen);
        expect(fs.existsSync(screenPath)).toBe(true);
      }
    });
  });

  describe('Draft Features', () => {
    it('should have draft board screen', () => {
      const draftPath = path.join(APP_SRC, 'app/(app)/DraftBoardPage.tsx');
      expect(fs.existsSync(draftPath)).toBe(true);

      const content = fs.readFileSync(draftPath, 'utf8');
      expect(content).toContain('export default');
    });

    it('should have season draft screens', () => {
      const draftScreens = [
        'app/(app)/season-draft/index.tsx',
        'app/(app)/season-draft/create.tsx',
      ];

      for (const screen of draftScreens) {
        const screenPath = path.join(APP_SRC, screen);
        expect(fs.existsSync(screenPath)).toBe(true);
      }
    });
  });

  describe('Player Features', () => {
    it('should have player stats screen', () => {
      const statsPath = path.join(APP_SRC, 'app/(app)/PlayerStats.tsx');
      expect(fs.existsSync(statsPath)).toBe(true);
    });

    it('should have player detail screen', () => {
      const detailPath = path.join(APP_SRC, 'app/(app)/PlayerDetail.tsx');
      expect(fs.existsSync(detailPath)).toBe(true);
    });
  });

  describe('Navigation Structure', () => {
    it('should have a route file for every sport navigation destination', () => {
      // Routes are registered by expo-router from the filesystem — LS-8766
      // deleted the explicit <Stack.Screen> entries, which existed only to set
      // header titles on a group that is now headerless.
      const expectedRoutes = [
        'index',
        'football/index',
        'baseball/index',
        'DraftBoardPage',
        'FreeAgents',
        'PlayerStats',
        'PlayerDetail',
        'baseball/league/[leagueId]',
        'baseball/team/[teamId]',
        'season-draft/index',
      ];

      for (const route of expectedRoutes) {
        const routePath = path.join(APP_SRC, `app/(app)/${route}.tsx`);
        expect(fs.existsSync(routePath)).toBe(true);
      }
    });

    it('should render no navigation header for any route in the group', () => {
      const layoutPath = path.join(APP_SRC, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      expect(content).toContain('headerShown: false');
      expect(content).not.toContain('headerShown: true');
      expect(content).not.toContain('headerTitle');
      expect(content).not.toContain('headerLeft');
    });

    it('should render the sport-selection Home tab via the shared HomeScreen', () => {
      // The sport-picker moved from the old drawer `index.tsx` into the Home
      // tab, which renders the shared cross-platform HomeScreen component.
      const homePath = path.join(APP_SRC, 'app/(app)/(tabs)/home.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      expect(content).toContain('HomeScreen');
      expect(content).toContain('@legacy-sports/shared-components');
      expect(content).toContain('router.push');
    });
  });
});
