jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { editPR } from './edit-pr';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

const LARGE_BODY = 'B'.repeat(60_000);

describe('editPR — compact response', () => {
  it('returns only updated fields, not full body, on title-only edit', async () => {
    mockedRest.mockResolvedValue({
      number: 42,
      title: 'New title',
      body: LARGE_BODY,
      html_url: 'https://github.com/o/r/pull/42',
    });
    const result = await editPR({ number: 42, title: 'New title' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.number).toBe(42);
    expect(parsed.updatedFields).toHaveProperty('title', 'New title');
    expect(parsed.updatedFields).not.toHaveProperty('body');
    // Full body must NOT appear at top level
    expect(parsed).not.toHaveProperty('body');
    // Response should be small
    expect(result.content[0].text.length).toBeLessThan(200);
  });

  it('includes body in updatedFields only when body was edited', async () => {
    mockedRest.mockResolvedValue({
      number: 42,
      title: 'Title',
      body: 'short body',
      html_url: 'https://github.com/o/r/pull/42',
    });
    const result = await editPR({ number: 42, body: 'short body' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.updatedFields).toHaveProperty('body', 'short body');
    expect(parsed.updatedFields).not.toHaveProperty('title');
  });

  it('returns error when neither title nor body is provided', async () => {
    const result = await editPR({ number: 42 });
    expect(result.isError).toBe(true);
  });
});

const JIRA_COMMENT = '<!-- jira-link\nprimary: LS-1234\n-->';
const JIRA_BLOCK = `${JIRA_COMMENT}\n\n**Jira:** [LS-1234](https://bkrupa.atlassian.net/browse/LS-1234)`;

describe('editPR — jira-link marker preservation', () => {
  it('re-injects marker when new body omits it but current PR body has one', async () => {
    const currentBody = `${JIRA_BLOCK}\n\nOld content`;
    const newBody = 'New content without marker';

    mockedRest
      .mockResolvedValueOnce({
        number: 10,
        title: 'PR',
        body: currentBody,
        html_url: 'https://github.com/o/r/pull/10',
      })
      .mockResolvedValueOnce({
        number: 10,
        title: 'PR',
        body: `${JIRA_BLOCK}\n\n${newBody}`,
        html_url: 'https://github.com/o/r/pull/10',
      });

    const result = await editPR({ number: 10, body: newBody });
    expect(result.isError).toBeFalsy();

    const patchCall = mockedRest.mock.calls[1];
    const patchBodyA = patchCall[0].body as Record<string, string>;
    expect(patchBodyA.body).toContain('<!-- jira-link');
    expect(patchBodyA.body).toContain(newBody);
  });

  it('does not duplicate marker when new body already has one', async () => {
    const bodyWithMarker = `${JIRA_BLOCK}\n\nUpdated content`;

    mockedRest.mockResolvedValue({
      number: 11,
      title: 'PR',
      body: bodyWithMarker,
      html_url: 'https://github.com/o/r/pull/11',
    });

    const result = await editPR({ number: 11, body: bodyWithMarker });
    expect(result.isError).toBeFalsy();

    // Only one call (no GET needed) and marker appears exactly once
    expect(mockedRest).toHaveBeenCalledTimes(1);
    const patchCall = mockedRest.mock.calls[0];
    const sentBody: string =
      (patchCall[0].body as Record<string, string>).body ?? '';
    const markerCount = (sentBody.match(/<!--\s*jira-link/gi) ?? []).length;
    expect(markerCount).toBe(1);
  });

  it("replaces a malformed caller marker with the PR's well-formed block (LS-8721)", async () => {
    const currentBody = `${JIRA_BLOCK}\n\nOld content`;
    // Hand-written one-line marker: matches the loose /<!--\s*jira-link\b/i
    // regex but has no `primary:` line, so jira-link-check.mjs rejects it.
    const newBody = '<!-- jira-link: LS-1234 -->\n\n## Verification\n\nchecked';

    mockedRest
      .mockResolvedValueOnce({
        number: 13,
        title: 'PR',
        body: currentBody,
        html_url: 'https://github.com/o/r/pull/13',
      })
      .mockResolvedValueOnce({
        number: 13,
        title: 'PR',
        body: 'patched',
        html_url: 'https://github.com/o/r/pull/13',
      });

    const result = await editPR({ number: 13, body: newBody });
    expect(result.isError).toBeFalsy();

    const sentBody: string =
      (mockedRest.mock.calls[1][0].body as Record<string, string>).body ?? '';
    // Exactly one marker, and it is the well-formed one.
    expect((sentBody.match(/<!--\s*jira-link/gi) ?? []).length).toBe(1);
    expect(sentBody).toContain('primary: LS-1234');
    expect(sentBody).not.toContain('<!-- jira-link: LS-1234 -->');
    // Caller's content survives.
    expect(sentBody).toContain('## Verification');
  });

  it('rejects a malformed caller marker when the PR has no well-formed block to fall back on (LS-8721)', async () => {
    mockedRest.mockResolvedValueOnce({
      number: 14,
      title: 'PR',
      body: 'Old content without marker',
      html_url: 'https://github.com/o/r/pull/14',
    });

    const result = await editPR({
      number: 14,
      body: '<!-- jira-link: LS-1234 -->\n\nbody',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('primary:');
    // The PATCH must not have been sent.
    expect(mockedRest).toHaveBeenCalledTimes(1);
  });

  it('does not inject a marker when neither new nor current PR body has one', async () => {
    const currentBody = 'Old content without marker';
    const newBody = 'New content without marker';

    mockedRest
      .mockResolvedValueOnce({
        number: 12,
        title: 'PR',
        body: currentBody,
        html_url: 'https://github.com/o/r/pull/12',
      })
      .mockResolvedValueOnce({
        number: 12,
        title: 'PR',
        body: newBody,
        html_url: 'https://github.com/o/r/pull/12',
      });

    const result = await editPR({ number: 12, body: newBody });
    expect(result.isError).toBeFalsy();

    const patchCall = mockedRest.mock.calls[1];
    const patchBodyC = patchCall[0].body as Record<string, string>;
    expect(patchBodyC.body).toBe(newBody);
    expect(patchBodyC.body).not.toContain('<!-- jira-link');
  });
});
