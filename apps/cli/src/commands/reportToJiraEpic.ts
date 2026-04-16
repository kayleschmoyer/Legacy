/**
 * CLI command: report-to-jira-epic
 *
 * Fetches a Playwright HTML report from bkrupa/legacy-sports-deploys,
 * finds all failing tests, and creates a Jira epic with one child ticket
 * per failing test.
 *
 * Required env vars (when not using --dry-run):
 *   JIRA_BASE_URL   e.g. https://myorg.atlassian.net
 *   JIRA_EMAIL      Atlassian account email
 *   JIRA_API_TOKEN  Atlassian API token
 *                   (generate at id.atlassian.com/manage-profile/security/api-tokens)
 *
 * Usage:
 *   ls-cli report-to-jira-epic nightly-12345
 *   ls-cli report-to-jira-epic pr-42 --issue-type Story
 *   ls-cli report-to-jira-epic nightly-12345 --dry-run
 *   ls-cli report-to-jira-epic https://bkrupa.github.io/.../playwright-report/pr-42/
 */

import { LOGGER } from '@legacy-sports/logging';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaywrightTest {
  title: string;
  outcome: 'expected' | 'unexpected' | 'skipped' | 'flaky';
}

interface PlaywrightFile {
  fileName: string;
  tests: PlaywrightTest[];
}

interface PlaywrightReport {
  stats: {
    total: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
    ok: boolean;
  };
  files: PlaywrightFile[];
}

interface FailingTest {
  file: string;
  title: string;
}

interface JiraIssueCreated {
  key: string;
  id: string;
}

// ─── Report fetching ──────────────────────────────────────────────────────────

/**
 * Valid report name pattern: nightly-<digits>, pr-<digits>, manual-<digits>,
 * or a generic lowercase-alphanumeric slug. Enforced before passing to shell
 * commands and GitHub API paths to prevent injection.
 */
const REPORT_NAME_PATTERN =
  /^(?:nightly-\d+|pr-\d+|manual-\d+|[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Normalize a report URL or name to just the report name and validate it.
 * Accepts:
 *   "nightly-12345"
 *   "pr-42"
 *   "manual-7"
 *   "https://bkrupa.github.io/legacy-sports-deploys/playwright-report/nightly-12345/"
 * Throws if the resolved name contains characters that could cause injection.
 */
function parseReportName(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/playwright-report\/([^/]+)\/?$/);
  const name = (match?.[1] ?? trimmed.replace(/\/$/, '')).trim();

  if (!name || !REPORT_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid report name "${input}". ` +
        `Expected "nightly-12345", "pr-42", "manual-7", or a GitHub Pages URL ` +
        `ending in "/playwright-report/<name>/".`,
    );
  }

  return name;
}

/**
 * Fetch and parse a Playwright report from the bkrupa/legacy-sports-deploys
 * GitHub Pages repo. Uses `gh` CLI for auth and Python for ZIP extraction.
 *
 * The HTML report embeds all test data as a base64-encoded ZIP in its last
 * <script> tag. See .agents/skills/read-playwright-report/SKILL.md for
 * background on why WebFetch doesn't work.
 */
function fetchReport(reportName: string): PlaywrightReport {
  LOGGER.info(`Fetching Playwright report: ${reportName}`);

  // Unique temp dir per invocation — avoids races if multiple runs execute
  // concurrently and prevents clobbering or symlink-following on shared hosts.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-extract-report-'));
  const scriptPath = path.join(tmpDir, 'extract.py');

  // All extraction logic lives in Python: gh for auth, base64 decoding,
  // and ZIP parsing. This avoids platform-specific shell pipe differences.
  const pythonScript = `
import subprocess, json, base64, zipfile, io, sys

report_name = sys.argv[1]

# Step 1: Get SHA of index.html (file is >1 MB; contents API returns empty
#         for large files, so we need the blob API which requires the SHA).
sha_proc = subprocess.run(
    ['gh', 'api',
     f'repos/bkrupa/legacy-sports-deploys/contents/playwright-report/{report_name}/index.html?ref=gh-pages',
     '--jq', '.sha'],
    capture_output=True, text=True, check=True
)
sha = sha_proc.stdout.strip()

# Step 2: Download blob as base64-encoded HTML.
blob_proc = subprocess.run(
    ['gh', 'api', f'repos/bkrupa/legacy-sports-deploys/git/blobs/{sha}', '--jq', '.content'],
    capture_output=True, text=True, check=True
)
html_b64 = blob_proc.stdout.strip().replace('\\n', '')
html_bytes = base64.b64decode(html_b64)

# Step 3: Find the embedded ZIP in the last <script> tag.
marker = b'data:application/zip;base64,'
idx = html_bytes.find(marker)
if idx == -1:
    print('ERROR: zip marker not found in report HTML', file=sys.stderr)
    sys.exit(1)
end_idx = html_bytes.find(b'</script>', idx)
zip_data = base64.b64decode(html_bytes[idx + len(marker):end_idx])

# Step 4: Extract report.json from the ZIP.
zf = zipfile.ZipFile(io.BytesIO(zip_data))
report = json.loads(zf.read('report.json'))
print(json.dumps(report))
`.trim();

  fs.writeFileSync(scriptPath, pythonScript, 'utf-8');

  // try/finally ensures the temp dir is cleaned up on all code paths,
  // including when the python fallback also fails.
  try {
    // Use spawnSync with an argv array — never interpolate user input into a
    // shell string, as that would re-introduce injection risk.
    const spawnOpts = {
      encoding: 'utf-8' as const,
      maxBuffer: 50 * 1024 * 1024,
    };

    let result = spawnSync('python3', [scriptPath, reportName], spawnOpts);

    // On Windows, python3 may not be on PATH — fall back to python.
    if (
      result.error &&
      (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      result = spawnSync('python', [scriptPath, reportName], spawnOpts);
    }

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `Python extraction failed (exit ${result.status ?? 'null'}):\n${result.stderr}`,
      );
    }

    return JSON.parse(result.stdout) as PlaywrightReport;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

function getFailingTests(report: PlaywrightReport): FailingTest[] {
  const failing: FailingTest[] = [];
  for (const file of report.files) {
    for (const test of file.tests) {
      if (test.outcome === 'unexpected') {
        failing.push({ file: file.fileName, title: test.title });
      }
    }
  }
  return failing;
}

// ─── Jira REST API ────────────────────────────────────────────────────────────

function makeAdfDoc(text: string): object {
  return {
    type: 'doc',
    version: 1,
    content: text
      .split('\n\n')
      .filter((p) => p.trim())
      .map((para) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: para }],
      })),
  };
}

interface CreateJiraIssueOpts {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  summary: string;
  description: string;
  issueType: string;
  parentKey?: string;
}

async function createJiraIssue(
  opts: CreateJiraIssueOpts,
): Promise<JiraIssueCreated> {
  const auth = Buffer.from(`${opts.email}:${opts.apiToken}`).toString('base64');

  const fields: Record<string, unknown> = {
    project: { key: opts.projectKey },
    summary: opts.summary.slice(0, 255),
    description: makeAdfDoc(opts.description),
    issuetype: { name: opts.issueType },
  };

  if (opts.issueType === 'Epic') {
    // customfield_10011 is the Epic Name field in classic Jira projects.
    // Including it is harmless in team-managed projects (ignored if unknown).
    fields['customfield_10011'] = opts.summary.slice(0, 255);
  }

  if (opts.parentKey) {
    fields['parent'] = { key: opts.parentKey };
  }

  const res = await fetch(
    `${opts.baseUrl.replace(/\/$/, '')}/rest/api/3/issue`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ fields }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Jira API ${res.status} (${opts.issueType}): ${errorText}`);
  }

  return res.json() as Promise<JiraIssueCreated>;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Validate and return Jira credentials from env vars.
 * Throws with a descriptive message if any are missing — TypeScript then
 * narrows the return type to non-nullable strings (no assertions needed).
 */
function getJiraCredentials(): {
  baseUrl: string;
  email: string;
  apiToken: string;
} {
  const baseUrl = process.env['JIRA_BASE_URL'];
  const email = process.env['JIRA_EMAIL'];
  const apiToken = process.env['JIRA_API_TOKEN'];

  if (!baseUrl || !email || !apiToken) {
    const missing: string[] = [];
    if (!baseUrl) missing.push('JIRA_BASE_URL');
    if (!email) missing.push('JIRA_EMAIL');
    if (!apiToken) missing.push('JIRA_API_TOKEN');
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return { baseUrl, email, apiToken };
}

export interface HandleReportToJiraEpicArgs {
  report: string;
  project: string;
  issueType: string;
  epicSummary?: string;
  dryRun?: boolean;
}

export async function handleReportToJiraEpic(
  args: HandleReportToJiraEpicArgs,
): Promise<void> {
  const reportName = parseReportName(args.report);
  const report = fetchReport(reportName);
  const { stats } = report;

  LOGGER.info(
    `Report — total: ${stats.total}, passed: ${stats.expected}, ` +
      `failed: ${stats.unexpected}, flaky: ${stats.flaky}, skipped: ${stats.skipped}`,
  );

  if (stats.unexpected === 0) {
    LOGGER.info('No failing tests found — nothing to create.');
    return;
  }

  const failingTests = getFailingTests(report);
  const epicSummary =
    args.epicSummary ??
    `[Playwright Failures] ${reportName} — ${failingTests.length} failing test${failingTests.length === 1 ? '' : 's'}`;

  if (args.dryRun) {
    LOGGER.info(`[dry-run] Epic: "${epicSummary}" in project ${args.project}`);
    for (const test of failingTests) {
      LOGGER.info(
        `[dry-run]   ${args.issueType}: [${test.file}] ${test.title}`,
      );
    }
    LOGGER.info(
      `[dry-run] Total: 1 Epic + ${failingTests.length} ${args.issueType} ticket${failingTests.length === 1 ? '' : 's'}`,
    );
    return;
  }

  // Validate credentials only in non-dry-run path.
  // getJiraCredentials() throws with a clear message if any are missing.
  const { baseUrl, email, apiToken } = getJiraCredentials();

  LOGGER.info(`Creating Epic: "${epicSummary}"...`);
  const epic = await createJiraIssue({
    baseUrl,
    email,
    apiToken,
    projectKey: args.project,
    summary: epicSummary,
    description:
      `Playwright report: ${reportName}\n\n` +
      `${stats.unexpected} failing, ${stats.flaky} flaky, ${stats.skipped} skipped out of ${stats.total} total tests.`,
    issueType: 'Epic',
  });
  LOGGER.info(`Created Epic: ${epic.key}`);

  let created = 0;
  let errored = 0;
  for (const test of failingTests) {
    const summary = `[E2E] ${test.title}`;
    const description =
      `Failing test in Playwright report \`${reportName}\`.\n\n` +
      `File: ${test.file}\n\nTest: ${test.title}`;
    try {
      const issue = await createJiraIssue({
        baseUrl,
        email,
        apiToken,
        projectKey: args.project,
        summary,
        description,
        issueType: args.issueType,
        parentKey: epic.key,
      });
      LOGGER.info(`  Created ${issue.key}: ${summary}`);
      created++;
    } catch (err) {
      LOGGER.warn(
        `  Failed to create ticket for "${test.title}": ${String(err)}`,
      );
      errored++;
    }
  }

  LOGGER.info(
    `Done. Epic: ${epic.key} | Created: ${created} child ticket${created === 1 ? '' : 's'} | Errors: ${errored}`,
  );
}
