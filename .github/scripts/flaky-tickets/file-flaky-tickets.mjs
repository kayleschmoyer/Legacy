#!/usr/bin/env node
/**
 * Nightly flaky-test → Jira filing (LS-9659).
 *
 * The automated full-suite ("nightly") Playwright run executes the hermetic
 * e2e suite at retries=2, so a flaky spec passes silently (Playwright outcome
 * 'flaky', run stays green) and then deterministically blocks unrelated PRs
 * at PR CI's retries=0. The agent-md-reporter now emits that flaky list as a
 * machine-readable JSON artifact ({ total, flaky: [{ file, title }] }); this
 * script turns it into durable, deduplicated Jira signal:
 *
 *   - One ticket per spec file, canonical summary `E2E flaky: <spec>` and
 *     label `e2e-flaky`.
 *   - Find-or-update: existing tickets are located by the `e2e-flaky` label
 *     (exact-match dedup key — JQL text search on summaries tokenizes paths
 *     unpredictably and a missed match would file a duplicate) plus an exact
 *     client-side summary comparison. Repeat flaky nights add an occurrence
 *     comment (count + run link) to the same ticket instead of a new one.
 *   - A ticket whose status category is Done is left closed; a recurrence
 *     after a fix files a fresh ticket for fresh triage.
 *
 * Authentication mirrors rollbar-jira-reconcile.yml: the workflow mints an
 * OAuth 2.0 client-credentials token and exports JIRA_ACCESS_TOKEN +
 * JIRA_API_BASE for this script.
 *
 * Usage:
 *   node file-flaky-tickets.mjs \
 *     --flaky-json <path>          # reporter artifact
 *     --run-url <url>              # nightly run URL for occurrence links
 *     [--project <key>]            # Jira project key (default LS)
 *     [--summary-md <path>]        # Markdown summary for $GITHUB_STEP_SUMMARY
 *     [--github-output]            # print key=value lines to stdout
 *
 * All progress logging goes to stderr so stdout stays clean for
 * --github-output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_PROJECT_KEY = 'LS';
const FLAKY_LABEL = 'e2e-flaky';
export const SUMMARY_PREFIX = 'E2E flaky: ';
/** Marker embedded in every occurrence comment so repeat nights can be
 * counted from the comment list alone. */
export const OCCURRENCE_MARKER = '[e2e-flaky-occurrence]';

const log = (...args) => console.error(...args);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Group the reporter's flaky entries ({ file, title }) by spec file.
 * Returns [{ spec, titles }] sorted by spec for deterministic processing;
 * titles are de-duplicated (retries across projects/shards can repeat one)
 * and sorted.
 */
export function groupFlakyBySpec(entries) {
  const bySpec = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.file !== 'string' || entry.file === '') continue;
    const title = typeof entry.title === 'string' ? entry.title : '(untitled)';
    let titles = bySpec.get(entry.file);
    if (!titles) {
      titles = new Set();
      bySpec.set(entry.file, titles);
    }
    titles.add(title);
  }
  return [...bySpec.entries()]
    .map(([spec, titles]) => ({ spec, titles: [...titles].sort() }))
    .sort((a, b) => (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0));
}

/** Canonical ticket summary for a spec path (the dedup key, per LS-9659). */
export function canonicalSummary(spec) {
  return `${SUMMARY_PREFIX}${spec}`;
}

/**
 * Pick the ticket a repeat flaky night should update: the newest issue (by
 * `created`) whose summary matches exactly and whose status category is not
 * Done. Returns null when every match is Done or there is no match — the
 * caller then creates a fresh ticket.
 */
export function pickExistingIssue(issues, summary) {
  const candidates = (Array.isArray(issues) ? issues : []).filter(
    (issue) =>
      issue?.fields?.summary === summary &&
      issue?.fields?.status?.statusCategory?.key !== 'done',
  );
  candidates.sort((a, b) =>
    String(b.fields?.created ?? '').localeCompare(
      String(a.fields?.created ?? ''),
    ),
  );
  return candidates[0] ?? null;
}

/** Count prior occurrence comments (comments carrying OCCURRENCE_MARKER). */
export function countOccurrenceComments(comments) {
  let count = 0;
  for (const comment of Array.isArray(comments) ? comments : []) {
    if (JSON.stringify(comment?.body ?? '').includes(OCCURRENCE_MARKER)) {
      count++;
    }
  }
  return count;
}

/**
 * Occurrence number for tonight's update: the creation night is occurrence 1
 * (the description), each prior marker comment is one more night.
 */
export function nextOccurrence(priorOccurrenceComments) {
  return priorOccurrenceComments + 2;
}

const adfText = (text) => ({ type: 'text', text });
const adfParagraph = (...content) => ({ type: 'paragraph', content });
const adfLink = (text, href) => ({
  type: 'text',
  text,
  marks: [{ type: 'link', attrs: { href } }],
});
const adfBulletList = (items) => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [adfParagraph(adfText(item))],
  })),
});
const adfDoc = (...content) => ({ type: 'doc', version: 1, content });

/** ADF description for a newly filed flaky-spec ticket. */
export function buildDescriptionAdf({ spec, titles, runUrl }) {
  return adfDoc(
    adfParagraph(
      adfText(
        `Detected by the automated full-suite ("nightly") Playwright run: the following test(s) in ${spec} ` +
          `passed only after retry (outcome 'flaky') at the nightly's retries=2. The same spec runs at ` +
          `retries=0 in PR CI, where this flake will fail unrelated PRs deterministically.`,
      ),
    ),
    adfBulletList(titles),
    adfParagraph(
      adfText('First seen (occurrence 1): '),
      adfLink(runUrl, runUrl),
    ),
    adfParagraph(
      adfText(
        'Filed automatically by the nightly flaky-test filing step (LS-9659). ' +
          'Repeat flaky nights add occurrence comments to this ticket instead of new tickets.',
      ),
    ),
  );
}

/** ADF comment for a repeat flaky night on an existing ticket. */
export function buildOccurrenceCommentAdf({ occurrence, titles, runUrl }) {
  return adfDoc(
    adfParagraph(
      adfText(
        `${OCCURRENCE_MARKER} Flaky again — occurrence ${occurrence}. Test(s) that passed only after retry:`,
      ),
    ),
    adfBulletList(titles),
    adfParagraph(adfText('Run: '), adfLink(runUrl, runUrl)),
  );
}

/** Markdown summary of tonight's filing results (for the job summary). */
export function renderSummaryMd(results) {
  const lines = ['## 🎯 Nightly Flaky-Test Tickets', ''];
  if (results.length === 0) {
    lines.push('No flaky tests tonight.');
    return `${lines.join('\n')}\n`;
  }
  lines.push('| Spec | Ticket | Action |');
  lines.push('|------|--------|--------|');
  for (const r of results) {
    const spec = r.spec.replace(/\|/g, '/');
    lines.push(`| ${spec} | ${r.key} | ${r.action} |`);
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Jira REST (thin fetch wrapper; auth env comes from the workflow step)
// ---------------------------------------------------------------------------

async function jiraApi(method, path, body, attempt = 1) {
  const base = process.env.JIRA_API_BASE;
  const token = process.env.JIRA_ACCESS_TOKEN;
  if (!base || !token) {
    throw new Error('JIRA_API_BASE / JIRA_ACCESS_TOKEN are not set');
  }
  const maxRetries = 3;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const text = await response.text();
  if (
    (response.status === 429 || response.status >= 500) &&
    attempt < maxRetries
  ) {
    const delay = 2000 * 2 ** (attempt - 1);
    log(
      `  ⚠️  Jira HTTP ${response.status} for ${method} ${path} — retry ${attempt}/${maxRetries} in ${delay}ms`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    return jiraApi(method, path, body, attempt + 1);
  }
  throw new Error(
    `Jira ${method} ${path} failed (HTTP ${response.status}): ${text}`,
  );
}

/**
 * List every issue in the project carrying the e2e-flaky label (paginated).
 *
 * Uses POST /rest/api/3/search/jql — the old GET /rest/api/3/search returns
 * HTTP 410 Gone (LS-11033). The new endpoint pages with an opaque
 * `nextPageToken` (no startAt/total); its absence marks the last page.
 * `api` is injectable for tests.
 */
export async function listFlakyLabelIssues(projectKey, api = jiraApi) {
  const jql = `project = ${projectKey} AND labels = "${FLAKY_LABEL}" ORDER BY created DESC`;
  const issues = [];
  let nextPageToken;
  do {
    const body = {
      jql,
      fields: ['summary', 'status', 'created'],
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    };
    const page = await api('POST', '/rest/api/3/search/jql', body);
    issues.push(...(page?.issues ?? []));
    nextPageToken = page?.nextPageToken;
  } while (nextPageToken);
  return issues;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    flakyJson: null,
    runUrl: null,
    project: DEFAULT_PROJECT_KEY,
    summaryMd: null,
    githubOutput: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--flaky-json') args.flakyJson = argv[++i];
    else if (a === '--run-url') args.runUrl = argv[++i];
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--summary-md') args.summaryMd = argv[++i];
    else if (a === '--github-output') args.githubOutput = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.flakyJson || !args.runUrl) {
    log('error: --flaky-json and --run-url are required');
    process.exit(2);
  }

  const report = JSON.parse(readFileSync(args.flakyJson, 'utf8'));
  const specs = groupFlakyBySpec(report?.flaky);
  log(`[flaky-tickets] ${specs.length} flaky spec(s) tonight.`);

  const results = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  if (specs.length > 0) {
    let existingIssues = [];
    try {
      existingIssues = await listFlakyLabelIssues(args.project);
      log(
        `[flaky-tickets] ${existingIssues.length} existing "${FLAKY_LABEL}"-labeled issue(s) in ${args.project}.`,
      );
    } catch (error) {
      // Without the dedup list we cannot safely create tickets (we would risk
      // duplicates) — fail the run instead of filing blind.
      log(
        `::error::failed to list existing ${FLAKY_LABEL} issues: ${error.message}`,
      );
      process.exit(1);
    }

    for (const { spec, titles } of specs) {
      const summary = canonicalSummary(spec);
      try {
        const existing = pickExistingIssue(existingIssues, summary);
        if (existing) {
          const commentPage = await jiraApi(
            'GET',
            `/rest/api/3/issue/${existing.key}/comment?maxResults=100&orderBy=created`,
          );
          const occurrence = nextOccurrence(
            countOccurrenceComments(commentPage?.comments),
          );
          await jiraApi('POST', `/rest/api/3/issue/${existing.key}/comment`, {
            body: buildOccurrenceCommentAdf({
              occurrence,
              titles,
              runUrl: args.runUrl,
            }),
          });
          log(
            `  🔁 ${existing.key} (${spec}): occurrence ${occurrence} comment added`,
          );
          results.push({
            spec,
            key: existing.key,
            action: `updated (occurrence ${occurrence})`,
          });
          updated++;
        } else {
          const createdIssue = await jiraApi('POST', '/rest/api/3/issue', {
            fields: {
              project: { key: args.project },
              issuetype: { name: 'Bug' },
              summary,
              labels: [FLAKY_LABEL],
              description: buildDescriptionAdf({
                spec,
                titles,
                runUrl: args.runUrl,
              }),
            },
          });
          log(`  🆕 ${createdIssue.key} (${spec}): ticket created`);
          results.push({ spec, key: createdIssue.key, action: 'created' });
          created++;
        }
      } catch (error) {
        log(
          `::error::failed to file/update ticket for ${spec}: ${error.message}`,
        );
        results.push({ spec, key: '—', action: `error: ${error.message}` });
        errors++;
      }
    }
  }

  if (args.summaryMd) {
    writeFileSync(args.summaryMd, renderSummaryMd(results));
  }
  if (args.githubOutput) {
    process.stdout.write(
      [
        `flaky-spec-count=${specs.length}`,
        `created-count=${created}`,
        `updated-count=${updated}`,
        `error-count=${errors}`,
        '',
      ].join('\n'),
    );
  }
  if (errors > 0) {
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
