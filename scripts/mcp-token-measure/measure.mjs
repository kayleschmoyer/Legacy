#!/usr/bin/env node
/**
 * scripts/mcp-token-measure/measure.mjs
 *
 * Token-cost measurement harness for MCP tool responses (LS-8020, epic LS-8018).
 *
 * Takes one or more representative response payloads (JSON) and reports the
 * token cost of three encodings — pretty JSON, minified JSON, and a Markdown
 * table — so each per-server migration is decided on measured numbers, not
 * priors, and can record before/after deltas in its PR.
 *
 * Usage:
 *   node scripts/mcp-token-measure/measure.mjs                 # all bundled fixtures
 *   node scripts/mcp-token-measure/measure.mjs path/to/x.json  # a captured payload
 *   node scripts/mcp-token-measure/measure.mjs --json          # machine-readable
 *   node scripts/mcp-token-measure/measure.mjs --backend=anthropic  # exact (needs API key)
 *   node scripts/mcp-token-measure/measure.mjs --selftest      # sanity checks
 *
 * Plain Node ESM, no build step, no new dependencies (top-level scripts/ may use
 * console; .mjs files are exempt from the no-console lint rule).
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENCODINGS } from './lib/encodings.mjs';
import { countTokens, estimateTokens } from './lib/tokenize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const BASELINE = 'pretty JSON';

function parseArgs(argv) {
  const opts = { backend: 'estimate', json: false, selftest: false, paths: [] };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--selftest') opts.selftest = true;
    else if (arg.startsWith('--backend='))
      opts.backend = arg.slice('--backend='.length);
    else if (arg === '-h' || arg === '--help') opts.help = true;
    else opts.paths.push(arg);
  }
  return opts;
}

const utf8Bytes = (text) => Buffer.byteLength(text, 'utf8');
const pct = (value, base) => (base === 0 ? 0 : ((value - base) / base) * 100);
const signed = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** Measure one payload across all encodings. */
async function measurePayload(name, payload, backend) {
  const encodings = [];
  for (const [encoding, encode] of Object.entries(ENCODINGS)) {
    const text = encode(payload);
    encodings.push({
      encoding,
      chars: text.length,
      bytes: utf8Bytes(text),
      tokens: await countTokens(text, { backend }),
    });
  }
  const baseTokens = encodings.find((e) => e.encoding === BASELINE).tokens;
  for (const e of encodings) e.deltaPct = pct(e.tokens, baseTokens);
  return { name, encodings };
}

function loadFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      name: basename(f, '.json'),
      payload: JSON.parse(readFileSync(join(FIXTURES_DIR, f), 'utf8')),
    }));
}

// Keep file reads inside the working tree. This is a local CLI with no
// privilege boundary, but containing reads to cwd keeps it tidy and avoids
// surprising an agent that passes an unexpected path.
function resolveInCwd(p) {
  const full = resolve(p);
  const rel = relative(process.cwd(), full);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Refusing to read outside the working directory: ${p}`);
  }
  return full;
}

function loadPaths(paths) {
  return paths.map((p) => {
    const full = resolveInCwd(p);
    return {
      name: basename(full).replace(/\.json$/, ''),
      payload: JSON.parse(readFileSync(full, 'utf8')),
    };
  });
}

function renderMarkdown(results, backend) {
  const out = [];
  out.push(`# MCP response token cost (backend: ${backend})\n`);
  out.push(
    `Tokens per encoding of each representative payload. ` +
      `Δ is token change vs **${BASELINE}** (negative = cheaper).\n`,
  );
  for (const { name, encodings } of results) {
    out.push(`## ${name}\n`);
    out.push('| Encoding | Chars | Bytes | Tokens | Δ vs pretty |');
    out.push('| --- | ---: | ---: | ---: | ---: |');
    for (const e of encodings) {
      const delta = e.encoding === BASELINE ? '—' : signed(e.deltaPct);
      out.push(
        `| ${e.encoding} | ${e.chars} | ${e.bytes} | ${e.tokens} | ${delta} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

function selftest() {
  const checks = [];
  const assert = (label, cond) => checks.push({ label, ok: Boolean(cond) });

  assert('empty string -> 0 tokens', estimateTokens('') === 0);
  assert('non-empty -> >0 tokens', estimateTokens('hello world') > 0);
  assert(
    'pretty JSON costs more tokens than minified for a list payload',
    (() => {
      const payload = {
        rows: Array.from({ length: 8 }, (_, i) => ({
          id: i,
          name: `row-${i}`,
          ok: true,
        })),
      };
      return (
        estimateTokens(ENCODINGS['pretty JSON'](payload)) >
        estimateTokens(ENCODINGS['minified JSON'](payload))
      );
    })(),
  );
  assert(
    'Markdown table beats pretty JSON for a uniform list',
    (() => {
      const payload = Array.from({ length: 10 }, (_, i) => ({
        number: 5000 + i,
        title: `LS-${i} do a thing`,
        status: 'open',
      }));
      return (
        estimateTokens(ENCODINGS['Markdown table'](payload)) <
        estimateTokens(ENCODINGS['pretty JSON'](payload))
      );
    })(),
  );
  assert(
    'Markdown encoding is lossless on keys',
    ENCODINGS['Markdown table']({ a: 1, items: [{ x: 1 }] }).includes('a') &&
      ENCODINGS['Markdown table']({ a: 1, items: [{ x: 1 }] }).includes(
        'items',
      ),
  );

  for (const { label, ok } of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  return failed === 0;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/mcp-token-measure/measure.mjs [payload.json ...] [options]',
      '',
      'Options:',
      '  --json                machine-readable output (for scripting / CI)',
      '  --backend=estimate    offline BPE approximation (default)',
      '  --backend=anthropic   exact counts via Claude API (needs ANTHROPIC_API_KEY)',
      '  --selftest            run sanity checks and exit',
      '  -h, --help            show this help',
      '',
      'With no payload paths, measures the bundled fixtures in ./fixtures.',
    ].join('\n'),
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.selftest) {
    process.exitCode = selftest() ? 0 : 1;
    return;
  }

  const inputs = opts.paths.length > 0 ? loadPaths(opts.paths) : loadFixtures();
  const results = [];
  for (const { name, payload } of inputs) {
    results.push(await measurePayload(name, payload, opts.backend));
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        { backend: opts.backend, baseline: BASELINE, results },
        null,
        2,
      ),
    );
  } else {
    console.log(renderMarkdown(results, opts.backend));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
