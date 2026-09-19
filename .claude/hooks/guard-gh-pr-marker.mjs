#!/usr/bin/env node
/**
 * guard-gh-pr-marker.mjs — PreToolUse (Bash) guard for the raw `gh` PR-body
 * fallback (LS-10110).
 *
 * When the hosted GitHub MCP connector is down, agents hand-write
 * `gh pr create --body-file` / `gh pr edit --body-file`. Nothing on that path
 * writes the `<!-- jira-link / primary: LS-#### / -->` marker Jira Link Check
 * requires, and nine recurrences showed behavioural rules do not hold. This
 * hook checks the body BEFORE the command runs and blocks (exit 2) when the
 * marker is missing or malformed.
 *
 * What it inspects:
 *   - `gh pr create|edit` with `--body-file <path>` / `-F <path>`: reads the
 *     file. If the file does not exist yet (it is written earlier in the same
 *     command, e.g. a heredoc) or is `-` (stdin), the whole command text stands
 *     in for the body.
 *   - `--body <text>` / `-b <text>`: the command text stands in for the body.
 *   - `gh pr create` with no body flag (`--fill`, `--web`, none): blocked — it
 *     cannot carry the marker.
 *   - `gh pr edit` with no body flag (labels, ready, ...): allowed.
 *
 * Preferred path: `node scripts/open-pr.mjs --ticket LS-#### ...`, which injects
 * the marker itself and is never blocked (it is not a `gh pr` command).
 *
 * Bypass (acknowledged deliberate marker-less body): `# marker-ok: <reason>`.
 * Fails OPEN on any parse or filesystem error, per the hook conventions.
 */

import { readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { checkPrBody, fixBlock } from '../../scripts/open-pr.mjs';
import { extractKeys } from '../../.github/scripts/jira-link-marker.mjs';
import { readHookInput, projectDir, truncate } from './lib/hook-utils.mjs';

function stripHeredocs(text) {
  const out = [];
  let delim = null;
  for (const line of text.split('\n')) {
    if (delim) {
      if (line.trim() === delim) delim = null;
      continue;
    }
    const m = line.match(/<<-?\s*["']?(\w+)["']?/);
    out.push(line);
    if (m) delim = m[1];
  }
  return out.join('\n');
}

const TOKEN_RE = /"(?:\\.|[^"\\])*"|'[^']*'|[;&|]+|[^\s;&|]+/g;

function unquote(token) {
  if (token.length >= 2 && /^["']/.test(token) && token.at(-1) === token[0]) {
    return token.slice(1, -1);
  }
  return token;
}

/**
 * Find every `gh pr create|edit` invocation in `command` and the body-related
 * flags each one carries. Heredoc bodies are dropped first so prose that merely
 * mentions the command never matches.
 */
function findGhPrCalls(command) {
  const tokens = stripHeredocs(command).match(TOKEN_RE) ?? [];
  const calls = [];
  for (let i = 0; i < tokens.length; i++) {
    if (
      !/(^|[\\/])gh(\.exe)?$/.test(unquote(tokens[i])) ||
      unquote(tokens[i + 1] ?? '') !== 'pr' ||
      !['create', 'edit'].includes(unquote(tokens[i + 2] ?? ''))
    ) {
      continue;
    }
    const call = {
      verb: unquote(tokens[i + 2]),
      bodyFile: null,
      inline: false,
    };
    for (let j = i + 3; j < tokens.length && !/^[;&|]+$/.test(tokens[j]); j++) {
      const t = unquote(tokens[j]);
      let m;
      if ((m = t.match(/^--body-file=(.+)$/))) call.bodyFile = m[1];
      else if (t === '--body-file' || t === '-F') {
        call.bodyFile = unquote(tokens[j + 1] ?? '');
        j++;
      } else if (/^--body=/.test(t) || t === '--body' || t === '-b') {
        call.inline = true;
      }
    }
    calls.push(call);
  }
  return calls;
}

function main() {
  const input = readHookInput();
  if (input?.tool_name !== 'Bash') process.exit(0);
  const command = String(input.tool_input?.command ?? '');
  if (!command || /(^|\s)#\s*marker-ok\b/.test(command)) process.exit(0);

  const calls = findGhPrCalls(command);
  if (calls.length === 0) process.exit(0);

  const cwd = (input.cwd || projectDir(input)).replace(/\\/g, '/');
  const problems = [];

  for (const call of calls) {
    let body = null;
    if (call.bodyFile && call.bodyFile !== '-') {
      const path = isAbsolute(call.bodyFile)
        ? call.bodyFile
        : join(cwd, call.bodyFile);
      try {
        body = readFileSync(path, 'utf8');
      } catch {
        body = command; // written earlier in this command (heredoc chain)
      }
    } else if (call.bodyFile === '-' || call.inline) {
      body = command;
    } else if (call.verb === 'create') {
      problems.push(
        '`gh pr create` without `--body-file` (or with `--fill`/`--web`) cannot carry the jira-link marker.',
      );
      continue;
    } else {
      continue; // `gh pr edit` that touches no body (labels, ready, ...)
    }

    const result = checkPrBody(body);
    if (!result.ok) problems.push(...result.errors);
  }

  if (problems.length === 0) process.exit(0);

  const key = extractKeys(command)[0];
  process.stderr.write(
    `[PR BODY BLOCKED] jira-link marker\n\n` +
      `${[...new Set(problems)].map((p) => `- ${p}`).join('\n')}\n\n` +
      `Jira Link Check (required) fails any PR body without this block — hit 9 times when the hosted GitHub MCP was down (LS-10110). Either:\n` +
      `  1. Use the wrapper, which injects it for you:\n` +
      `     node scripts/open-pr.mjs --ticket ${key ?? 'LS-####'} --title "<title>" --body-file <file> --head <branch> --draft\n` +
      `  2. Or put this at the TOP of the body, then re-run:\n\n${fixBlock(key)}\n\n` +
      `Check a body file without creating anything: node scripts/open-pr.mjs --check <body-file>\n` +
      `Deliberate marker-less body? Re-run with \`# marker-ok: <reason>\`.\n\n` +
      `Blocked Bash call: ${truncate(command, 160)}\n`,
  );
  process.exit(2);
}

try {
  main();
} catch {
  process.exit(0); // fail open
}
