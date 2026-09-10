import { describe, expect, it, jest } from '@jest/globals';

import {
  checkJiraAuth,
  HOSTED_CONNECTOR_CAVEAT,
  rosterHasService,
} from './auth-checks';

const noNetrc = jest.fn(() => false);

describe('HOSTED_CONNECTOR_CAVEAT', () => {
  it('names the recurring incidents it exists to prevent re-litigating', () => {
    expect(HOSTED_CONNECTOR_CAVEAT).toContain('LS-9439');
    expect(HOSTED_CONNECTOR_CAVEAT).toContain('LS-9370');
    expect(HOSTED_CONNECTOR_CAVEAT).toContain('LS-9924');
  });

  it('states the check is presence-only, not a reachability guarantee', () => {
    expect(HOSTED_CONNECTOR_CAVEAT).toMatch(/presence-only/i);
    expect(HOSTED_CONNECTOR_CAVEAT).toMatch(/reachable/i);
  });
});

describe('checkJiraAuth', () => {
  it('reports unconfigured when no credential shape is present', () => {
    expect(checkJiraAuth({}, noNetrc)).toEqual({ ok: false });
  });

  it('recognizes basic auth env vars', () => {
    expect(
      checkJiraAuth({ JIRA_EMAIL: 'a@b.com', JIRA_API_TOKEN: 'tok' }, noNetrc),
    ).toEqual({ ok: true, method: 'env:basic' });
  });

  it('recognizes direct OAuth env vars', () => {
    expect(
      checkJiraAuth(
        {
          JIRA_CLIENT_ID: 'id',
          JIRA_CLIENT_SECRET: 'secret',
          JIRA_CLOUD_ID: 'cloud',
        },
        noNetrc,
      ),
    ).toEqual({ ok: true, method: 'env:oauth' });
  });

  it('recognizes ~/.netrc credentials', () => {
    const checkNetrc = jest.fn(
      (machine: string) => machine === 'atlassian.net',
    );
    expect(checkJiraAuth({}, checkNetrc)).toEqual({
      ok: true,
      method: 'netrc',
    });
  });

  it('recognizes the hosted Copilot-cloud bearer path', () => {
    expect(
      checkJiraAuth(
        { MCP_JIRA_URL: 'https://example.com', MCP_JIRA_BEARER: 'bearer' },
        noNetrc,
      ),
    ).toEqual({ ok: true, method: 'hosted:oauth' });
  });

  it('recognizes the hosted local/worktree machine-credential path', () => {
    expect(
      checkJiraAuth(
        {
          MCP_JIRA_URL: 'https://example.com',
          MCP_MACHINE_CLIENT_ID: 'id',
          MCP_MACHINE_CLIENT_SECRET: 'secret',
        },
        noNetrc,
      ),
    ).toEqual({ ok: true, method: 'hosted:oauth' });
  });

  it('does not treat MCP_JIRA_URL alone as configured', () => {
    expect(
      checkJiraAuth({ MCP_JIRA_URL: 'https://example.com' }, noNetrc),
    ).toEqual({ ok: false });
  });

  it('does not treat a bearer without a URL as configured', () => {
    expect(checkJiraAuth({ MCP_JIRA_BEARER: 'bearer' }, noNetrc)).toEqual({
      ok: false,
    });
  });
});

describe('rosterHasService (LS-9749)', () => {
  it('returns undefined (unknown) when sessionToolNames is omitted — preserves old presence-only behavior', () => {
    expect(rosterHasService('github', undefined)).toBeUndefined();
    expect(rosterHasService('jira', undefined)).toBeUndefined();
    expect(rosterHasService('ci', undefined)).toBeUndefined();
  });

  it('returns true when a matching hosted-connector tool name is present', () => {
    expect(
      rosterHasService('github', ['mcp__legacy-sports-github__github_open_pr']),
    ).toBe(true);
    expect(rosterHasService('github', ['github_open_pr'])).toBe(true);
    expect(
      rosterHasService('jira', ['mcp__legacy-sports-jira__jira_view']),
    ).toBe(true);
    expect(rosterHasService('jira', ['jira_view'])).toBe(true);
    expect(
      rosterHasService('ci', ['mcp__legacy-sports-ci-local__ci_list_runs']),
    ).toBe(true);
  });

  it('returns false when the roster is non-empty but has no matching tool name — the LS-9749 false-green case', () => {
    expect(
      rosterHasService('jira', ['mcp__worktree__worktree_commit', 'make_run']),
    ).toBe(false);
    expect(rosterHasService('github', [])).toBe(false);
  });

  it('does not false-positive on unrelated tools whose names merely contain the service word', () => {
    // e.g. a jira-adjacent doc tool or a github-flavored variable name should
    // not be mistaken for the real connector's tools.
    expect(rosterHasService('github', ['some_github_docs_helper'])).toBe(false);
  });
});
