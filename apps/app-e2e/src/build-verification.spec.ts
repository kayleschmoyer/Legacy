/**
 * Build and Configuration Verification Tests
 *
 * Validates that the mobile app build configuration, project structure,
 * and E2E test dependencies are correctly set up. These tests run in
 * Jest without requiring a device or emulator.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../app');
const E2E_ROOT = path.resolve(__dirname, '..');

describe('Build and Configuration Verification', () => {
  describe('App Build Configuration', () => {
    it('should have Expo app config', () => {
      const appJsonPath = path.join(APP_ROOT, 'app.json');
      expect(fs.existsSync(appJsonPath)).toBe(true);

      const appConfig = JSON.parse(
        fs.readFileSync(appJsonPath, 'utf8'),
      ) as Record<string, unknown>;
      expect(appConfig.expo).toBeDefined();
    });

    it('should have Metro bundler config', () => {
      const metroPath = path.join(APP_ROOT, 'metro.config.js');
      expect(fs.existsSync(metroPath)).toBe(true);
    });

    it('should have Babel configuration', () => {
      const babelPath = path.join(APP_ROOT, '.babelrc.js');
      expect(fs.existsSync(babelPath)).toBe(true);
    });

    it('should have Nx project configuration', () => {
      const projectPath = path.join(APP_ROOT, 'project.json');
      expect(fs.existsSync(projectPath)).toBe(true);

      const project = JSON.parse(
        fs.readFileSync(projectPath, 'utf8'),
      ) as Record<string, unknown>;
      const targets = project.targets as Record<string, unknown>;
      expect(targets['build']).toBeDefined();
      expect(targets['serve']).toBeDefined();
    });
  });

  describe('E2E Test Dependencies', () => {
    it('should have all required WebDriverIO packages', () => {
      const packagePath = path.join(E2E_ROOT, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as {
        devDependencies: Record<string, string>;
      };

      const requiredDeps = [
        '@wdio/appium-service',
        '@wdio/cli',
        '@wdio/local-runner',
        '@wdio/mocha-framework',
        '@wdio/spec-reporter',
        'appium',
        'webdriverio',
      ];

      for (const dep of requiredDeps) {
        expect(pkg.devDependencies[dep]).toBeDefined();
      }
    });

    it('should have correct E2E project tags', () => {
      const projectPath = path.join(E2E_ROOT, 'project.json');
      const project = JSON.parse(
        fs.readFileSync(projectPath, 'utf8'),
      ) as Record<string, unknown>;
      const tags = project.tags as string[];

      expect(tags).toContain('platform:mobile');
      expect(tags).toContain('scope:e2e');
      expect(tags).toContain('type:test');
    });

    it('should have implicit dependency on app project', () => {
      const projectPath = path.join(E2E_ROOT, 'project.json');
      const project = JSON.parse(
        fs.readFileSync(projectPath, 'utf8'),
      ) as Record<string, unknown>;
      const deps = project.implicitDependencies as string[];

      expect(deps).toContain('app');
    });
  });

  describe('App Source Structure', () => {
    it('should have required screen files', () => {
      const requiredScreens = [
        'app/_layout.tsx',
        'app/login.tsx',
        'app/(app)/index.tsx',
        'app/(app)/_layout.tsx',
        'app/(app)/baseball/index.tsx',
        'app/(app)/football/index.tsx',
        'app/(app)/DraftBoardPage.tsx',
      ];

      for (const screen of requiredScreens) {
        const screenPath = path.join(APP_ROOT, 'src', screen);
        expect(fs.existsSync(screenPath)).toBe(true);
      }
    });

    it('should have test setup for unit tests', () => {
      const testSetupPath = path.join(APP_ROOT, 'src/test-setup.ts');
      expect(fs.existsSync(testSetupPath)).toBe(true);
    });

    it('should have Jest config for unit tests', () => {
      const jestConfigPath = path.join(APP_ROOT, 'jest.config.ts');
      expect(fs.existsSync(jestConfigPath)).toBe(true);
    });
  });

  describe('Platform-Specific Configuration', () => {
    it('should have Android capabilities in WebDriverIO config', () => {
      const configPath = path.join(E2E_ROOT, 'wdio.conf.js');
      const content = fs.readFileSync(configPath, 'utf8');

      expect(content).toContain("platformName: 'Android'");
      expect(content).toContain("'appium:automationName': 'UiAutomator2'");
      expect(content).toContain("'appium:appWaitActivity': '.MainActivity'");
    });

    it('should have correct Appium service configuration', () => {
      const configPath = path.join(E2E_ROOT, 'wdio.conf.js');
      const content = fs.readFileSync(configPath, 'utf8');

      expect(content).toContain("'appium'");
      expect(content).toContain('port: 4723');
    });

    it('should target correct app APK path', () => {
      const configPath = path.join(E2E_ROOT, 'wdio.conf.js');
      const content = fs.readFileSync(configPath, 'utf8');

      expect(content).toContain('app-debug.apk');
    });
  });
});
