import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  awsResourceName,
  awsSsmPath,
  DEFAULT_HARNESS_CONFIG,
  deploysPagesUrl,
  findHarnessConfigPath,
  getHarnessConfig,
  HARNESS_CONFIG_FILENAME,
  HarnessConfigError,
  loadHarnessConfig,
  mcpServerName,
  mcpToolNamePattern,
  resetHarnessConfigCache,
  ticketKeyPattern,
  ticketUrl,
} from './index';

const OTHER_PROJECT = {
  name: 'acme-shop',
  mcpServerPrefix: 'acme',
  jira: { projectKey: 'ACME', siteUrl: 'https://acme.atlassian.net' },
  github: {
    deploysRepo: 'acme/acme-shop-deploys',
    deploysPagesBaseUrl: 'https://acme.github.io/acme-shop-deploys',
  },
  aws: { resourcePrefix: 'acme-shop', ciArtifactsBucket: 'acme-shop-ci' },
  dotfileDir: '.acme-shop',
};

describe('@legacy-sports/mcp-config', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'harness-config-'));
    resetHarnessConfigCache();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    resetHarnessConfigCache();
  });

  const writeConfig = (dir: string, body: unknown): string => {
    const path = join(dir, HARNESS_CONFIG_FILENAME);
    writeFileSync(
      path,
      typeof body === 'string' ? body : JSON.stringify(body),
      'utf8',
    );
    return path;
  };

  describe('discovery', () => {
    it('finds the nearest config walking up from a nested directory', () => {
      const path = writeConfig(root, OTHER_PROJECT);
      const nested = join(root, 'tools', 'mcp', 'jira-server');
      mkdirSync(nested, { recursive: true });

      expect(findHarnessConfigPath(nested)).toBe(path);
      const loaded = loadHarnessConfig({ cwd: nested, env: {} });
      expect(loaded.source).toBe(path);
      expect(loaded.config).toEqual(OTHER_PROJECT);
      expect(loaded.overrides).toEqual([]);
    });

    it('falls back to the built-in defaults when no file exists', () => {
      const loaded = loadHarnessConfig({ cwd: root, env: {} });
      expect(loaded.source).toBeNull();
      expect(loaded.config).toEqual(DEFAULT_HARNESS_CONFIG);
      // The fallback must be a copy — callers mutating it must not poison defaults.
      expect(loaded.config).not.toBe(DEFAULT_HARNESS_CONFIG);
    });

    it('honours HARNESS_CONFIG_PATH over discovery', () => {
      writeConfig(root, OTHER_PROJECT);
      const elsewhere = join(root, 'elsewhere');
      mkdirSync(elsewhere);
      const explicit = join(elsewhere, 'custom.json');
      writeFileSync(
        explicit,
        JSON.stringify({ ...OTHER_PROJECT, name: 'explicit' }),
      );

      const loaded = loadHarnessConfig({
        cwd: root,
        env: { HARNESS_CONFIG_PATH: explicit },
      });
      expect(loaded.source).toBe(explicit);
      expect(loaded.config.name).toBe('explicit');
    });

    it('resolves a relative configPath against cwd and prefers it over the env var', () => {
      const explicit = join(root, 'custom.json');
      writeFileSync(explicit, JSON.stringify(OTHER_PROJECT));

      const loaded = loadHarnessConfig({
        cwd: root,
        configPath: 'custom.json',
        env: { HARNESS_CONFIG_PATH: join(root, 'does-not-exist.json') },
      });
      expect(loaded.source).toBe(explicit);
    });

    it('throws when an explicit path does not exist', () => {
      expect(() =>
        loadHarnessConfig({
          cwd: root,
          env: { HARNESS_CONFIG_PATH: join(root, 'missing.json') },
        }),
      ).toThrow(HarnessConfigError);
    });
  });

  describe('env overrides', () => {
    it('applies every HARNESS_* override on top of the file and reports them', () => {
      writeConfig(root, OTHER_PROJECT);
      const loaded = loadHarnessConfig({
        cwd: root,
        env: {
          HARNESS_NAME: 'override',
          HARNESS_MCP_SERVER_PREFIX: 'ovr',
          HARNESS_JIRA_PROJECT_KEY: 'OVR',
          HARNESS_JIRA_SITE_URL: 'https://ovr.atlassian.net',
          HARNESS_GITHUB_DEPLOYS_REPO: 'ovr/deploys',
          HARNESS_GITHUB_DEPLOYS_PAGES_BASE_URL:
            'https://ovr.github.io/deploys',
          HARNESS_AWS_RESOURCE_PREFIX: 'ovr',
          HARNESS_AWS_CI_ARTIFACTS_BUCKET: 'ovr-ci',
          HARNESS_DOTFILE_DIR: '.ovr',
        },
      });

      expect(loaded.config).toEqual({
        name: 'override',
        mcpServerPrefix: 'ovr',
        jira: { projectKey: 'OVR', siteUrl: 'https://ovr.atlassian.net' },
        github: {
          deploysRepo: 'ovr/deploys',
          deploysPagesBaseUrl: 'https://ovr.github.io/deploys',
        },
        aws: { resourcePrefix: 'ovr', ciArtifactsBucket: 'ovr-ci' },
        dotfileDir: '.ovr',
      });
      expect(loaded.overrides).toHaveLength(9);
    });

    it('ignores empty-string env vars', () => {
      writeConfig(root, OTHER_PROJECT);
      const loaded = loadHarnessConfig({
        cwd: root,
        env: { HARNESS_JIRA_PROJECT_KEY: '' },
      });
      expect(loaded.config.jira.projectKey).toBe('ACME');
      expect(loaded.overrides).toEqual([]);
    });

    it('overrides the defaults when no file exists (hosted Lambda case)', () => {
      const loaded = loadHarnessConfig({
        cwd: root,
        env: { HARNESS_JIRA_PROJECT_KEY: 'HOSTED' },
      });
      expect(loaded.source).toBeNull();
      expect(loaded.config.jira.projectKey).toBe('HOSTED');
      expect(loaded.config.aws).toEqual(DEFAULT_HARNESS_CONFIG.aws);
    });
  });

  describe('validation', () => {
    it('rejects an invalid Jira project key with a readable message', () => {
      writeConfig(root, {
        ...OTHER_PROJECT,
        jira: { ...OTHER_PROJECT.jira, projectKey: 'ls-lower' },
      });
      expect(() => loadHarnessConfig({ cwd: root, env: {} })).toThrow(
        /jira\.projectKey: expected an upper-case Jira project key/,
      );
    });

    it('rejects a deploys repo that is not an owner/repo slug', () => {
      writeConfig(root, {
        ...OTHER_PROJECT,
        github: {
          ...OTHER_PROJECT.github,
          deploysRepo: 'https://github.com/acme/deploys',
        },
      });
      expect(() => loadHarnessConfig({ cwd: root, env: {} })).toThrow(
        /github\.deploysRepo: expected a GitHub "owner\/repo" slug/,
      );
    });

    it('rejects a missing section and names the file', () => {
      const { github: _github, ...withoutGithub } = OTHER_PROJECT;
      void _github;
      const path = writeConfig(root, withoutGithub);
      let caught: unknown;
      try {
        loadHarnessConfig({ cwd: root, env: {} });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HarnessConfigError);
      expect((caught as HarnessConfigError).path).toBe(path);
      expect((caught as Error).message).toContain(path);
      expect((caught as Error).message).toMatch(/github/);
    });

    it('rejects malformed JSON and a non-object root', () => {
      writeConfig(root, '{ not json');
      expect(() => loadHarnessConfig({ cwd: root, env: {} })).toThrow(
        /not valid JSON/,
      );

      writeConfig(root, '[]');
      expect(() => loadHarnessConfig({ cwd: root, env: {} })).toThrow(
        /must contain a JSON object/,
      );
    });

    it('rejects an invalid env override rather than falling back silently', () => {
      writeConfig(root, OTHER_PROJECT);
      expect(() =>
        loadHarnessConfig({
          cwd: root,
          env: { HARNESS_JIRA_SITE_URL: 'not-a-url' },
        }),
      ).toThrow(/env overrides: HARNESS_JIRA_SITE_URL/);
    });
  });

  describe('getHarnessConfig cache', () => {
    it('caches the first resolution until reset', () => {
      const first = getHarnessConfig();
      expect(getHarnessConfig()).toBe(first);
      resetHarnessConfigCache();
      expect(getHarnessConfig()).not.toBe(first);
      expect(getHarnessConfig()).toEqual(first);
    });
  });

  describe('helpers', () => {
    const config = OTHER_PROJECT;

    it('ticketKeyPattern matches and captures keys on word boundaries', () => {
      const re = ticketKeyPattern(config);
      expect('feat(x): thing (ACME-42)'.match(re)?.[1]).toBe('ACME-42');
      expect(re.test('XACME-42')).toBe(false);
      expect(re.test('LS-42')).toBe(false);
      expect('ACME-1 and ACME-2'.match(ticketKeyPattern(config, 'g'))).toEqual([
        'ACME-1',
        'ACME-2',
      ]);
    });

    it('ticketUrl and deploysPagesUrl normalise slashes', () => {
      expect(ticketUrl(config, 'ACME-7')).toBe(
        'https://acme.atlassian.net/browse/ACME-7',
      );
      expect(
        ticketUrl(
          { jira: { ...config.jira, siteUrl: 'https://acme.atlassian.net/' } },
          'ACME-7',
        ),
      ).toBe('https://acme.atlassian.net/browse/ACME-7');
      expect(deploysPagesUrl(config, '/playwright-report/run-1/')).toBe(
        'https://acme.github.io/acme-shop-deploys/playwright-report/run-1/',
      );
    });

    it('aws helpers follow the <prefix>-<env>-<short> and /<prefix>/<env>/<name> conventions', () => {
      expect(awsResourceName(config, 'dev', 'graphql')).toBe(
        'acme-shop-dev-graphql',
      );
      expect(awsSsmPath(config, 'dev', 'db/url')).toBe('/acme-shop/dev/db/url');
      expect(awsSsmPath(config, 'dev', '/db/url')).toBe(
        '/acme-shop/dev/db/url',
      );
    });

    it('mcp helpers build server and tool-name patterns', () => {
      expect(mcpServerName(config, 'nx')).toBe('acme-nx');
      const re = mcpToolNamePattern(config, 'nx');
      expect(re.test('mcp__acme-nx__nx_run')).toBe(true);
      expect(re.test('mcp__acme-nxx__nx_run')).toBe(false);
      expect(re.test('mcp__legacy-sports-nx__nx_run')).toBe(false);
    });

    it('defaults reproduce the legacy-sports conventions exactly', () => {
      const d = DEFAULT_HARNESS_CONFIG;
      expect(awsResourceName(d, 'dev', 'graphql')).toBe(
        'legacy-sports-dev-graphql',
      );
      expect(awsSsmPath(d, 'dev', 'x')).toBe('/legacy-sports/dev/x');
      expect(mcpServerName(d, 'nx')).toBe('legacy-sports-nx');
      expect(ticketKeyPattern(d).test('LS-10951')).toBe(true);
      expect(deploysPagesUrl(d, 'playwright-report/r/')).toBe(
        'https://bkrupa.github.io/legacy-sports-deploys/playwright-report/r/',
      );
    });
  });
});
