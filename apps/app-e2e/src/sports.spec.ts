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

    it('should have football route in drawer navigator', () => {
      const layoutPath = path.join(APP_SRC, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      expect(content).toContain("title: 'Football'");
      expect(content).toContain('name="football/index"');
    });
  });

  describe('Baseball Features', () => {
    it('should have baseball screen component', () => {
      const baseballPath = path.join(APP_SRC, 'app/(app)/baseball/index.tsx');
      expect(fs.existsSync(baseballPath)).toBe(true);

      const content = fs.readFileSync(baseballPath, 'utf8');
      expect(content).toContain('export default');
    });

    it('should have baseball route in drawer navigator', () => {
      const layoutPath = path.join(APP_SRC, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      expect(content).toContain("title: 'Baseball'");
      expect(content).toContain('name="baseball/index"');
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
    it('should have all sport navigation routes registered', () => {
      const layoutPath = path.join(APP_SRC, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

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
        expect(content).toContain(`name="${route}"`);
      }
    });

    it('should have home screen as sport selection hub', () => {
      const homePath = path.join(APP_SRC, 'app/(app)/index.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      expect(content).toContain('Fantasy Sports Hub');
      expect(content).toContain("name: 'Football'");
      expect(content).toContain("name: 'Baseball'");
      expect(content).toContain('router.push');
    });
  });
});
