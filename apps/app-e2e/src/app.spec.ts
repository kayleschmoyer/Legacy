/**
 * App E2E Infrastructure Tests
 *
 * Validates the E2E test infrastructure for the mobile app.
 * These tests run in Jest (no device required) and verify that
 * the test setup, configuration, and component testID conventions
 * are correctly established for WebDriverIO E2E testing.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../app/src');
const E2E_ROOT = path.resolve(__dirname, '..');

describe('Legacy Sports App - E2E Test Infrastructure', () => {
  describe('App Launch and Core Functionality', () => {
    it('should have root layout component', () => {
      const layoutPath = path.join(APP_ROOT, 'app/_layout.tsx');
      expect(fs.existsSync(layoutPath)).toBe(true);

      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('export default function Layout');
      expect(content).toContain('ErrorBoundary');
      expect(content).toContain('TamaguiProvider');
    });

    it('should export testID constants for E2E selectors', () => {
      const layoutPath = path.join(APP_ROOT, 'app/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('APP_TEST_IDS');
      expect(content).toContain("loginScreen: 'login-screen'");
      expect(content).toContain("homeScreen: 'home-screen'");
      expect(content).toContain("drawerContent: 'drawer-content'");
    });

    it('should have loading panel available', () => {
      const layoutPath = path.join(APP_ROOT, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('UnifiedLoadingPanel');
    });
  });

  describe('Navigation and Screens', () => {
    it('should have drawer navigator with all routes', () => {
      const layoutPath = path.join(APP_ROOT, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      expect(content).toContain("from 'expo-router/drawer'");
      expect(content).toContain("title: 'Home'");
      expect(content).toContain("title: 'Football'");
      expect(content).toContain("title: 'Baseball'");
      expect(content).toContain("title: 'Draft Board'");
      expect(content).toContain("title: 'Free Agents'");
    });

    it('should have drawer items with testID props', () => {
      const layoutPath = path.join(APP_ROOT, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');

      expect(content).toContain('testID="drawer-content"');
      expect(content).toContain('testID="drawer-logout"');
      expect(content).toContain('testID={`drawer-item-');
    });

    it('should have home screen with sport navigation', () => {
      const homePath = path.join(APP_ROOT, 'app/(app)/index.tsx');
      expect(fs.existsSync(homePath)).toBe(true);

      const content = fs.readFileSync(homePath, 'utf8');
      expect(content).toContain('testID="home-screen"');
      expect(content).toContain('testID="sport-selection"');
      expect(content).toContain('sport-button-');
    });
  });

  describe('Authentication Flow', () => {
    it('should have login screen with testID props', () => {
      const loginPath = path.join(APP_ROOT, 'app/login.tsx');
      expect(fs.existsSync(loginPath)).toBe(true);

      const loginContent = fs.readFileSync(loginPath, 'utf8');
      expect(loginContent).toContain('testID="login-screen"');

      // login-button / login-title / login-error live in the shared LoginPage card
      const sharedLoginPath = path.resolve(
        APP_ROOT,
        '../../../lib/shared-components/src/features/auth/LoginPage.tsx',
      );
      const sharedContent = fs.readFileSync(sharedLoginPath, 'utf8');
      expect(sharedContent).toContain('testID="login-button"');
      expect(sharedContent).toContain('testID="login-title"');
      expect(sharedContent).toContain('testID="login-error"');
    });

    it('should redirect unauthenticated users to login', () => {
      const layoutPath = path.join(APP_ROOT, 'app/(app)/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('Redirect href="/login"');
    });

    it('should have auth guard at root level', () => {
      const layoutPath = path.join(APP_ROOT, 'app/_layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('EnhancedAuthGuard');
      expect(content).toContain('AuthProvider');
    });
  });

  describe('WebDriverIO Configuration', () => {
    it('should have valid wdio config', () => {
      const configPath = path.join(E2E_ROOT, 'wdio.conf.js');
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain("platformName: 'Android'");
      expect(content).toContain("'appium:automationName': 'UiAutomator2'");
      expect(content).toContain("framework: 'mocha'");
    });

    it('should have e2e test files for WebDriverIO', () => {
      const e2ePath = path.join(E2E_ROOT, 'src/app.e2e.js');
      expect(fs.existsSync(e2ePath)).toBe(true);
    });

    it('should have Appium dependencies configured', () => {
      const packagePath = path.join(E2E_ROOT, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
        devDependencies: Record<string, string>;
      };

      expect(pkg.devDependencies['@wdio/cli']).toBeDefined();
      expect(pkg.devDependencies['webdriverio']).toBeDefined();
      expect(pkg.devDependencies['@wdio/appium-service']).toBeDefined();
      expect(pkg.devDependencies['appium']).toBeDefined();
    });
  });

  describe('Test Infrastructure', () => {
    it('should have Jest configured for validation tests', () => {
      const jestConfigPath = path.join(E2E_ROOT, 'jest.config.json');
      expect(fs.existsSync(jestConfigPath)).toBe(true);

      const config = JSON.parse(
        fs.readFileSync(jestConfigPath, 'utf8'),
      ) as Record<string, unknown>;
      expect(config.testEnvironment).toBe('node');
      expect(config.testTimeout).toBe(120000);
    });

    it('should have TypeScript config for E2E tests', () => {
      const tsconfigPath = path.join(E2E_ROOT, 'tsconfig.e2e.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);

      const config = JSON.parse(
        fs.readFileSync(tsconfigPath, 'utf8'),
      ) as Record<string, unknown>;
      const compilerOptions = config.compilerOptions as Record<string, unknown>;
      const types = compilerOptions.types as string[];
      expect(types).toContain('jest');
      expect(types).toContain('node');
    });
  });
});
