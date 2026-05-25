#!/usr/bin/env node
/**
 * GraphQL contract gate (Tier 0 of the integration-safety system).
 *
 * Two static checks, both run with zero live backend and zero new dependencies
 * (uses the `graphql` package already pulled in by graphql-codegen):
 *
 *   1. Breaking-change diff — compares the PR's generated schema against the
 *      schema on the base branch (origin/main) using graphql.findBreakingChanges
 *      / findDangerousChanges. Catches field/type/enum/arg removals and
 *      nullability changes that the existing drift+codegen check cannot see,
 *      and that otherwise only surface in the nightly live-backend suite.
 *
 *   2. Operation validation — parses every committed `.graphql` operation under
 *      **\/src/api/db/** and validates it against the NEW schema. Surfaces UI
 *      operations that reference fields/args the schema no longer provides, with
 *      a clearer message than a codegen stack trace.
 *
 * Exit codes:
 *   0  — clean, or only dangerous/safe changes
 *   1  — breaking schema changes and/or invalid operations were found
 *
 * The caller (check-schema.yml) decides whether a non-zero exit blocks the PR
 * or is downgraded to a warning when the `schema-breaking-ok` label is present.
 *
 * Usage:
 *   node check-contract.mjs --old <base-schema.graphql> --new <pr-schema.graphql> \
 *     [--operations-root apps/web] [--operations-root apps/app] [--json]
 *
 * With no --operations-root flags, every `**\/src/api/db/**\/*.graphql` file in
 * the repo is discovered and grouped by its owning package.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildSchema,
  parse,
  validate,
  specifiedRules,
  findBreakingChanges,
  findDangerousChanges,
  NoUnusedFragmentsRule,
  NoUnusedVariablesRule,
} from 'graphql';

// ---------------------------------------------------------------------------
// Pure, testable helpers
// ---------------------------------------------------------------------------

/**
 * Compare two schema SDL strings and bucket the changes.
 * @param {string} oldSDL
 * @param {string} newSDL
 * @returns {{ breaking: Array<{type: string, description: string}>, dangerous: Array<{type: string, description: string}> }}
 */
export function classifySchemaChanges(oldSDL, newSDL) {
  const oldSchema = buildSchema(oldSDL, { assumeValid: true });
  const newSchema = buildSchema(newSDL, { assumeValid: true });
  return {
    breaking: findBreakingChanges(oldSchema, newSchema).map((c) => ({
      type: c.type,
      description: c.description,
    })),
    dangerous: findDangerousChanges(oldSchema, newSchema).map((c) => ({
      type: c.type,
      description: c.description,
    })),
  };
}

// This gate checks schema *compatibility*, not client-side hygiene. Drop the
// two "unused" rules: a fragment or variable can legitimately be defined for
// use by generated helpers or conditional directives, and graphql-codegen
// itself does not fail on them. Every other standard rule (field existence,
// argument types, fragment type conditions, variable usage compatibility) is
// exactly what catches a UI/backend mismatch, so those are kept.
const OPERATION_RULES = specifiedRules.filter(
  (rule) => rule !== NoUnusedFragmentsRule && rule !== NoUnusedVariablesRule,
);

/**
 * Validate a group of operation documents (operations + fragments that resolve
 * each other) against a schema. Documents in a group are concatenated so
 * cross-file fragment spreads resolve.
 * @param {import('graphql').GraphQLSchema} schema
 * @param {Array<{file: string, sdl: string}>} documents
 * @returns {Array<{file: string, message: string}>} validation errors
 */
export function validateOperationGroup(schema, documents) {
  const merged = documents
    .map((d) => `# @source ${d.file}\n${d.sdl}`)
    .join('\n');
  let doc;
  try {
    doc = parse(merged);
  } catch (err) {
    return [
      {
        file: documents[0]?.file ?? '(group)',
        message: `parse error: ${err.message}`,
      },
    ];
  }
  return validate(schema, doc, OPERATION_RULES).map((err) => ({
    file: locateError(err, documents),
    message: err.message,
  }));
}

// Best-effort: map a GraphQL error back to the source file using the
// `# @source` markers embedded in the merged document.
function locateError(err, documents) {
  const line = err.locations?.[0]?.line;
  if (!line) return '(group)';
  const mergedLines = documents
    .map((d) => `# @source ${d.file}\n${d.sdl}`)
    .join('\n')
    .split('\n');
  for (let i = line - 1; i >= 0; i--) {
    const m = mergedLines[i]?.match(/^# @source (.+)$/);
    if (m) return m[1];
  }
  return documents[0]?.file ?? '(group)';
}

/**
 * Group operation files by their owning package so fragments resolve within a
 * package boundary (mirrors how graphql-codegen scopes `documents`).
 * @param {string[]} files absolute or repo-relative paths
 * @returns {Map<string, string[]>} packageRoot -> files
 */
export function groupByPackage(files) {
  const groups = new Map();
  for (const file of files) {
    const norm = file.split(path.sep).join('/');
    const marker = '/src/api/db/';
    const idx = norm.indexOf(marker);
    const key = idx === -1 ? path.dirname(norm) : norm.slice(0, idx);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  return groups;
}

/**
 * Render a markdown report. Returns { body, hasBreaking, hasInvalidOps }.
 */
export function formatReport({ breaking, dangerous, invalidOperations }) {
  const lines = [];
  const hasBreaking = breaking.length > 0;
  const hasInvalidOps = invalidOperations.length > 0;

  if (!hasBreaking && !hasInvalidOps && dangerous.length === 0) {
    lines.push('## GraphQL contract gate: passed');
    lines.push('');
    lines.push(
      'No breaking schema changes, dangerous changes, or invalid operations detected.',
    );
    return { body: lines.join('\n'), hasBreaking, hasInvalidOps };
  }

  lines.push('## GraphQL contract gate');
  lines.push('');

  if (hasBreaking) {
    lines.push(`### Breaking schema changes (${breaking.length})`);
    lines.push('');
    lines.push(
      'These remove or narrow part of the API surface. Deployed clients and the live-backend integration suite may break.',
    );
    lines.push('');
    for (const c of breaking) lines.push(`- \`${c.type}\` — ${c.description}`);
    lines.push('');
    lines.push(
      'If this break is intentional and clients/integration specs have been updated, add the **`schema-breaking-ok`** label to acknowledge and unblock.',
    );
    lines.push('');
  }

  if (hasInvalidOps) {
    lines.push(`### Invalid operations (${invalidOperations.length})`);
    lines.push('');
    lines.push(
      'These committed `.graphql` operations no longer validate against the schema in this PR:',
    );
    lines.push('');
    for (const o of invalidOperations)
      lines.push(`- \`${o.file}\` — ${o.message}`);
    lines.push('');
  }

  if (dangerous.length > 0) {
    lines.push(`### Dangerous changes (${dangerous.length}) — advisory`);
    lines.push('');
    lines.push(
      'Not blocking, but verify deployed clients tolerate these (e.g. new enum values, new optional args):',
    );
    lines.push('');
    for (const c of dangerous) lines.push(`- \`${c.type}\` — ${c.description}`);
    lines.push('');
  }

  return { body: lines.join('\n'), hasBreaking, hasInvalidOps };
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.nx',
  'coverage',
]);

function walkGraphqlFiles(root, acc) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkGraphqlFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.graphql')) {
      acc.push(full);
    }
  }
  return acc;
}

// Operation files live under **/src/api/db/**; schema SDL (lambdas/db/*.graphql)
// is excluded so we never try to validate type-system definitions as operations.
function discoverOperationFiles(roots) {
  const searchRoots = roots.length > 0 ? roots : ['.'];
  const found = new Set();
  for (const r of searchRoots) {
    for (const f of walkGraphqlFiles(r, [])) {
      const norm = f.split(path.sep).join('/');
      if (norm.includes('/src/api/db/')) found.add(norm);
    }
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { old: null, new: null, operationRoots: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--old') args.old = argv[++i];
    else if (a === '--new') args.new = argv[++i];
    else if (a === '--operations-root') args.operationRoots.push(argv[++i]);
    else if (a === '--json') args.json = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.new) {
    console.error('error: --new <pr-schema.graphql> is required');
    process.exit(2);
  }

  const newSDL = readFileSync(args.new, 'utf8');

  // 1. Breaking-change diff (skipped when there is no base schema, e.g. first
  //    time the schema file is introduced).
  let breaking = [];
  let dangerous = [];
  if (args.old) {
    try {
      const oldSDL = readFileSync(args.old, 'utf8');
      ({ breaking, dangerous } = classifySchemaChanges(oldSDL, newSDL));
    } catch (err) {
      console.error(
        `warning: could not diff against base schema (${err.message}). Skipping breaking-change check.`,
      );
    }
  }

  // 2. Operation validation against the new schema.
  const schema = buildSchema(newSDL, { assumeValid: true });
  const files = discoverOperationFiles(args.operationRoots);
  const groups = groupByPackage(files);
  const invalidOperations = [];
  for (const [, groupFiles] of groups) {
    const documents = groupFiles.map((file) => ({
      file,
      sdl: readFileSync(file, 'utf8'),
    }));
    invalidOperations.push(...validateOperationGroup(schema, documents));
  }

  const report = formatReport({ breaking, dangerous, invalidOperations });

  if (args.json) {
    console.log(
      JSON.stringify(
        { breaking, dangerous, invalidOperations, ...report },
        null,
        2,
      ),
    );
  } else {
    console.log(report.body);
  }

  process.exit(report.hasBreaking || report.hasInvalidOps ? 1 : 0);
}

// Only run main when invoked directly (not when imported by tests).
// pathToFileURL handles relative argv[1] and characters needing URL-encoding,
// unlike a raw `file://${process.argv[1]}` comparison.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
