#!/usr/bin/env node
'use strict';

/**
 * CLI adapter for .github/workflows/jira-branch-sync.yml and
 * .github/workflows/jira-status-audit.yml. Prints a single JSON object to
 * stdout; the workflows parse it with jq. Output goes through
 * process.stdout so it stays copy-paste-clean (no logger prefixes) — this
 * package is dependency-free by design so the workflows can run it with
 * bare node, without a pnpm install.
 *
 * Commands:
 *   plan  --event-name <push|pull_request> --event-path <github-event.json>
 *         [--open-pr-count <n>]
 *     → { skip, reason, keys, target }
 *
 *   guard --current <status> --target <status> --event-name <name>
 *         [--action <action>] [--merged <true|false>]
 *     → { allowed, noop, reason }
 *
 *   audit --pr-file <pr.json>
 *     → { skip, reason, key, source, expected }
 *     The file holds one PR object from `gh pr list --json
 *     number,title,body,isDraft,headRefName,state` (state "MERGED" marks a
 *     merged PR).
 *
 *   audit-action --current <status> --expected <status>
 *         --guard-allowed <true|false> --auto-repair <true|false>
 *         --has-label <true|false>
 *     → { action, addLabel, removeLabel, reason }
 */

const fs = require('node:fs');

const { decideAuditAction, planAudit } = require('./audit');
const { planSync } = require('./plan');
const { isAllowedMove } = require('./state-machine');

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseFlags(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const name = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${name}`);
    }
    flags[name] = value;
    i += 1;
  }
  return flags;
}

/** @param {Record<string, string>} flags */
function runPlan(flags) {
  const eventName = flags['event-name'];
  const eventPath = flags['event-path'];
  if (!eventName || !eventPath) {
    throw new Error('plan requires --event-name and --event-path');
  }
  /** @type {any} */
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));

  const branch =
    eventName === 'push'
      ? String(event.ref ?? '').replace(/^refs\/heads\//, '')
      : String(event.pull_request?.head?.ref ?? '');

  const openPrCountRaw = flags['open-pr-count'] ?? '0';
  if (!/^\d+$/.test(openPrCountRaw)) {
    // Fail closed: a malformed count must never bypass the open-PR gate.
    throw new Error(
      `--open-pr-count must be a non-negative integer, got "${openPrCountRaw}"`,
    );
  }

  return planSync({
    eventName,
    action: event.action,
    merged: event.pull_request?.merged === true,
    isDraft: event.pull_request?.draft === true,
    branch,
    prTitle: event.pull_request?.title ?? '',
    prBody: event.pull_request?.body ?? '',
    openPrCount: Number(openPrCountRaw),
  });
}

/** @param {Record<string, string>} flags */
function runGuard(flags) {
  const { current, target } = flags;
  const eventName = flags['event-name'];
  if (!current || !target || !eventName) {
    throw new Error('guard requires --current, --target, and --event-name');
  }
  return isAllowedMove(current, target, {
    eventName,
    action: flags.action,
    merged: flags.merged === 'true',
  });
}

/** @param {Record<string, string>} flags */
function runAudit(flags) {
  const prFile = flags['pr-file'];
  if (!prFile) {
    throw new Error('audit requires --pr-file');
  }
  /** @type {any} */
  const pr = JSON.parse(fs.readFileSync(prFile, 'utf8'));

  return planAudit({
    merged: pr.state === 'MERGED' || Boolean(pr.mergedAt),
    isDraft: pr.isDraft === true,
    title: pr.title ?? '',
    body: pr.body ?? '',
    branch: pr.headRefName ?? '',
  });
}

/** @param {Record<string, string>} flags */
function runAuditAction(flags) {
  const { current, expected } = flags;
  if (!current || !expected) {
    throw new Error('audit-action requires --current and --expected');
  }
  /** @param {string} name */
  const bool = (name) => {
    const value = flags[name];
    if (value !== 'true' && value !== 'false') {
      // Fail closed: a malformed boolean must never silently enable repairs.
      throw new Error(
        `--${name} must be "true" or "false", got "${value ?? ''}"`,
      );
    }
    return value === 'true';
  };

  return decideAuditAction({
    current,
    expected,
    guardAllowed: bool('guard-allowed'),
    autoRepair: bool('auto-repair'),
    hasLabel: bool('has-label'),
  });
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  let result;
  if (command === 'plan') {
    result = runPlan(flags);
  } else if (command === 'guard') {
    result = runGuard(flags);
  } else if (command === 'audit') {
    result = runAudit(flags);
  } else if (command === 'audit-action') {
    result = runAuditAction(flags);
  } else {
    throw new Error(
      `unknown command "${command ?? ''}" — expected plan, guard, audit, or audit-action`,
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `jira-sync: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

module.exports = { parseFlags, runPlan, runGuard, runAudit, runAuditAction };
