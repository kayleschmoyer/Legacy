#!/usr/bin/env node
/**
 * open-pr.mjs — the `gh pr create` fallback that cannot omit the jira-link
 * marker (LS-10110).
 *
 * When the hosted `legacy-sports-github` connector is down, agents fall back to
 * a raw `gh pr create --body-file`. Nothing on that path writes the
 * `<!-- jira-link / primary: LS-#### / -->` marker Jira Link Check requires, and
 * nine recurrences show behavioural rules ("grep the body first") do not hold.
 * This wrapper makes the compliant path the easy one: it takes the ticket key
 * as a required argument and injects the marker itself. The
 * `.claude/hooks/guard-gh-pr-marker.mjs` PreToolUse hook blocks the raw `gh`
 * path that would bypass it.
 *
 * Usage:
 *   node scripts/open-pr.mjs --ticket LS-#### --title "LS-#### type(scope): msg" \
 *     --body-file <file> --head <branch> [--base main] [--draft] \
 *     [--related LS-1,LS-2] [--dry-run]
 *   node scripts/open-pr.mjs --check <body-file> [--title "<title>"]
 *
 * `--ticket none` is for ticket-less bot PRs and requires the `no-jira` label
 * afterwards (this script does not apply labels).
 *
 * Marker parsing/insertion is imported from .github/scripts/jira-link-marker.mjs
 * so this script, the hook, and the CI check share one definition of "valid".
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  applyMarker,
  buildMarkerBlock,
  extractKeys,
  isValidPrimary,
  parseMarker,
} from '../.github/scripts/jira-link-marker.mjs';

/**
 * Validate a PR body (and optionally title) the way Jira Link Check does, minus
 * the network call.
 *
 * @returns {{ ok: boolean, primary: string | null, errors: string[] }}
 */
export function checkPrBody(body, title = '') {
  const marker = parseMarker(body);
  const errors = [...marker.errors];
  if (
    title &&
    marker.primary &&
    marker.primary !== 'none' &&
    !extractKeys(title).includes(marker.primary)
  ) {
    errors.push(
      `PR title does not contain the primary key ${marker.primary}. Prefix ` +
        `the title with it, e.g. "${marker.primary} type(scope): msg".`,
    );
  }
  return { ok: errors.length === 0, primary: marker.primary, errors };
}

/** The copy-pasteable block a failing body needs. */
export function fixBlock(primary = 'LS-####') {
  return buildMarkerBlock({ primary });
}

/** Body with a single well-formed marker for `ticket`, replacing any other. */
export function prepareBody(body, { ticket, related = [] }) {
  return applyMarker(body, { primary: ticket, related });
}

/** Argument vector for `gh pr create` — always explicit `--head`/`--base`. */
export function buildCreateArgs({ title, bodyFile, head, base, draft }) {
  const args = [
    'pr',
    'create',
    '--title',
    title,
    '--body-file',
    bodyFile,
    '--head',
    head,
    '--base',
    base,
  ];
  if (draft) args.push('--draft');
  return args;
}

function fail(message) {
  process.stderr.write(`open-pr: ${message}\n`);
  process.exit(1);
}

function runCheck(file, title) {
  let body;
  try {
    body = readFileSync(resolve(file), 'utf8');
  } catch (error) {
    return fail(`cannot read body file ${file}: ${error.message}`);
  }
  const result = checkPrBody(body, title);
  if (result.ok) {
    process.stdout.write(`jira-link marker OK (primary: ${result.primary})\n`);
    return;
  }
  const detected = extractKeys(`${title ?? ''}\n${body}`)[0];
  process.stderr.write(
    `${result.errors.map((e) => `- ${e}`).join('\n')}\n\n` +
      `Put this at the top of the body (or use \`node scripts/open-pr.mjs --ticket ${detected ?? 'LS-####'} ...\`, which injects it):\n\n` +
      `${fixBlock(detected)}\n`,
  );
  process.exit(1);
}

function runCreate(values) {
  const {
    ticket,
    title,
    head,
    base,
    draft,
    related,
    'dry-run': dryRun,
  } = values;
  const bodyPath = values['body-file'];
  for (const [flag, value] of [
    ['--ticket', ticket],
    ['--title', title],
    ['--body-file', bodyPath],
    ['--head', head],
  ]) {
    if (!value) fail(`${flag} is required (see the usage header in this file)`);
  }
  if (!isValidPrimary(ticket)) {
    fail(`--ticket "${ticket}" must be an uppercase LS-#### key or "none"`);
  }
  const relatedKeys = related ? related.split(/[,\s]+/).filter(Boolean) : [];
  const badRelated = relatedKeys.filter(
    (k) => !isValidPrimary(k) || k === 'none',
  );
  if (badRelated.length > 0) {
    fail(`--related contains invalid keys: ${badRelated.join(', ')}`);
  }

  let body;
  try {
    body = readFileSync(resolve(bodyPath), 'utf8');
  } catch (error) {
    return fail(`cannot read body file ${bodyPath}: ${error.message}`);
  }

  const prepared = prepareBody(body, { ticket, related: relatedKeys });
  const result = checkPrBody(prepared, title);
  if (!result.ok) {
    fail(
      `refusing to create the PR:\n${result.errors.map((e) => `- ${e}`).join('\n')}`,
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'open-pr-'));
  const tempBody = join(tempDir, 'body.md');
  writeFileSync(tempBody, prepared);
  const ghArgs = buildCreateArgs({
    title,
    bodyFile: tempBody,
    head,
    base: base ?? 'main',
    draft,
  });

  try {
    if (dryRun) {
      process.stdout.write(
        `gh ${ghArgs.join(' ')}\n\n--- prepared body ---\n${prepared}`,
      );
      return;
    }
    const url = execFileSync('gh', ghArgs, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
    }).trim();
    process.stdout.write(`${url}\n`);
    verifyCreated(url, ticket);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Read the stored body back with `gh` (which, unlike the built-in GitHub MCP
 * tools, does not strip HTML comments) and confirm the marker landed.
 */
function verifyCreated(url, ticket) {
  try {
    const stored = JSON.parse(
      execFileSync('gh', ['pr', 'view', url, '--json', 'body'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ).body;
    const check = checkPrBody(stored ?? '');
    if (!check.ok || check.primary !== ticket) {
      process.stderr.write(
        `open-pr: WARNING — stored PR body does not carry a valid marker for ${ticket}: ${check.errors.join('; ')}\n`,
      );
      process.exitCode = 1;
    }
  } catch {
    process.stderr.write(
      'open-pr: could not read the PR body back to verify the marker (PR was created).\n',
    );
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      ticket: { type: 'string' },
      title: { type: 'string' },
      'body-file': { type: 'string' },
      head: { type: 'string' },
      base: { type: 'string' },
      related: { type: 'string' },
      draft: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      check: { type: 'string' },
    },
    strict: true,
  });
  if (values.check) return runCheck(values.check, values.title);
  return runCreate(values);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
