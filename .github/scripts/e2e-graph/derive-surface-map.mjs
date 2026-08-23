#!/usr/bin/env node
/**
 * Graph-derived hermetic E2E surface map generator (LS-9661).
 *
 * Replaces hand-maintained glob curation (apps/web-e2e/src/e2e-surface-map.json,
 * LS-7846) with spec→file reachability derived from the real module graph:
 *
 *   spec reachable set =
 *       transitive import closure of the spec itself (POMs, fixtures, mocks,
 *       drivers — the e2e-side graph)
 *     ∪ the app-shell EAGER closure (apps/web/src/main.tsx following static
 *       imports only — code that executes on every route)
 *     ∪ for every route the spec (or any e2e file in its closure) visits via
 *       `goto(...)`: the full closure of the page component(s) mounted at the
 *       matching route pattern in apps/web/src/app/app.tsx (static + dynamic
 *       imports — a page lazily loading a modal still owns that modal).
 *
 * Selection stays with the existing engine: the emitted manifest has the exact
 * shape select-specs.mjs consumes ({ runAllWhenChanged, specs }), with exact
 * file paths in place of hand globs (an exact path is a valid glob). The
 * --json CLI contract of select-specs.mjs is untouched (AC2).
 *
 * Anchoring rationale (from the ticket): specs import POMs, which import
 * nothing from apps/web — the spec-side graph alone can never reach app code.
 * Route visits are the bridge: goto('/about') → Route path="/about" →
 * AboutPage module → its transitive closure.
 *
 * Conservatism rules (under-selection is the failure mode this system exists
 * to prevent; over-selection just costs minutes):
 *   - A goto() argument that cannot be statically resolved (an identifier
 *     that is not a same-file const, a cross-file constant, a fully dynamic
 *     expression) falls back to route-shaped literals harvested from the
 *     spec's e2e closure; if none match a route pattern, the spec reaches
 *     EVERY routed page.
 *   - A visited route that matches no route pattern is reported as a warning
 *     and ALSO makes the spec reach every routed page (a typo'd table is
 *     worse than a broad selection).
 *   - Build/config/harness files that sit outside the module graph keep a
 *     hand-written runAllWhenChanged core (AC3), including this generator's
 *     own directory.
 *
 * Zero dependencies (node stdlib only) so it can run in the detect-changes CI
 * job, which deliberately skips pnpm install. Output is deterministic: no
 * timestamps, sorted keys, sorted file lists (AC1).
 *
 * Usage:
 *   node derive-surface-map.mjs [--repo-root <dir>] [--out <file>]
 *                               [--stats-out <file>] [--quiet]
 *
 * All progress logging goes to stderr; --out writes the manifest (stdout when
 * omitted); --stats-out writes { specCount, fileRefs, warnings[], elapsedMs }.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const log = (...args) => console.error(...args);

const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs'];
const INDEX_BASENAMES = CODE_EXTENSIONS.map((e) => `index${e}`);

/**
 * Files outside the module graph whose change must keep forcing the full
 * suite (AC3). Deliberately small and reviewed by humans — this is the only
 * hand-maintained piece left. `.github/scripts/e2e-graph/**` is included
 * because a generator bug is exactly the kind of change that must not be able
 * to hide its own blast radius.
 */
export const RUN_ALL_CORE = [
  '.github/actions/e2e-testing/**',
  '.github/scripts/e2e-graph/**',
  '.github/scripts/integration-select/select-specs.mjs',
  'apps/web-e2e/playwright*.config.ts',
  'apps/web-e2e/src/global-setup.ts',
  'apps/web-e2e/src/coverage-global-teardown.ts',
  'apps/web-e2e/src/resolve-pw-browser.ts',
  'apps/web-e2e/src/fixtures/**',
  'apps/web-e2e/src/utils/**',
  'apps/web/index.html',
  'apps/web/vite.config.ts',
  'lambdas/db/schema.graphql',
  'lambdas/db/src/schema/**',
  'tsconfig.base.json',
];

// ---------------------------------------------------------------------------
// tsconfig path aliases
// ---------------------------------------------------------------------------

/**
 * Tolerant tsconfig parse: plain JSON first, then progressively strip
 * whole-line // comments and trailing commas. Block comments are deliberately
 * NOT stripped — `/*` legitimately appears inside path-glob strings and a
 * blind regex corrupts them.
 */
export function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  }
}

/**
 * Load compilerOptions.paths from tsconfig.base.json into matcher entries.
 * @returns {Array<{ prefix: string, suffix: string, target: string, wildcard: boolean }>}
 */
export function loadPathAliases(repoRoot) {
  const raw = parseJsonc(
    readFileSync(path.join(repoRoot, 'tsconfig.base.json'), 'utf8'),
  );
  const paths = raw?.compilerOptions?.paths ?? {};
  const aliases = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) continue;
    const target = targets[0];
    if (target.startsWith('node_modules/')) continue; // external — never repo source
    const star = pattern.indexOf('*');
    if (star === -1) {
      aliases.push({ prefix: pattern, suffix: '', target, wildcard: false });
    } else {
      aliases.push({
        prefix: pattern.slice(0, star),
        suffix: pattern.slice(star + 1),
        target,
        wildcard: true,
      });
    }
  }
  // Longest prefix first so subpath aliases win over the bare package alias.
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return aliases;
}

// ---------------------------------------------------------------------------
// Import extraction + resolution
// ---------------------------------------------------------------------------

/** Sentinel name meaning "everything the module provides / all its code runs". */
export const ALL = '*';

const IMPORT_CLAUSE_RE =
  /(?:^|\n)\s*import\s+(type\s+)?([\w$]+\s*,\s*)?(?:([\w$]+)|\*\s*as\s+[\w$]+|\{([^}]*)\})?\s*(?:,\s*(?:\*\s*as\s+[\w$]+|\{([^}]*)\}))?\s*from\s+['"]([^'"\n]+)['"]/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"\n]+)['"]/g;
const EXPORT_FROM_RE =
  /(?:^|\n)\s*export\s+(type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{([^}]*)\})\s*from\s+['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT_RE =
  /import\s*\(\s*['"]([^'"\n]+)['"]\s*\)|require\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

function parseBindingList(list) {
  return list
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const m = b.match(/^(?:type\s+)?([\w$]+|default)(?:\s+as\s+([\w$]+))?$/);
      return m ? { source: m[1], local: m[2] ?? m[1] } : null;
    })
    .filter(Boolean);
}

/**
 * Parse a module's import/export surface with binding names, enabling
 * demand-driven (name-narrowed) closure through re-export barrels.
 *
 * @returns {{
 *   imports: Array<{ specifier: string, names: string[] }>, // names may be [ALL]
 *   reexports: Array<{ specifier: string, names: string[] | null }>, // null = `export * from`
 *   dynamic: string[],
 *   isPureBarrel: boolean, // module body is only imports/re-exports — no local code
 * }}
 */
export function extractImports(source) {
  // Strip block comments so commented-out imports don't create edges. Line
  // comments are left alone (stripping them naively corrupts URLs in strings).
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const imports = [];
  const reexports = [];
  const dynamic = [];

  for (const m of text.matchAll(IMPORT_CLAUSE_RE)) {
    if (m[1]) continue; // `import type` — erased at runtime, no edge
    const names = new Set();
    if (m[2] || m[3]) names.add('default');
    if (m[0].includes('* as')) {
      imports.push({ specifier: m[6], names: [ALL] });
      continue;
    }
    for (const part of [m[4], m[5]]) {
      if (part) for (const b of parseBindingList(part)) names.add(b.source);
    }
    imports.push({
      specifier: m[6],
      names: names.size > 0 ? [...names] : [ALL],
    });
  }
  for (const m of text.matchAll(SIDE_EFFECT_IMPORT_RE)) {
    imports.push({ specifier: m[1], names: [ALL] });
  }
  for (const m of text.matchAll(EXPORT_FROM_RE)) {
    if (m[1]) continue; // `export type … from` — erased at runtime
    if (m[2] === undefined) {
      reexports.push({ specifier: m[3], names: null }); // export * from
    } else {
      reexports.push({
        specifier: m[3],
        names: parseBindingList(m[2]).map((b) => b.source),
        exported: parseBindingList(m[2]).map((b) => b.local),
      });
    }
  }
  for (const m of text.matchAll(DYNAMIC_IMPORT_RE)) {
    dynamic.push(m[1] ?? m[2]);
  }

  // A "pure barrel" contains nothing but import/re-export statements: demanding
  // one export from it must not pull in every other export's subtree.
  const residue = text
    .replace(IMPORT_CLAUSE_RE, '')
    .replace(SIDE_EFFECT_IMPORT_RE, '')
    .replace(EXPORT_FROM_RE, '')
    .replace(/(?:^|\n)\s*export\s*\{[^}]*\}\s*;?/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/[;\s]/g, '');
  const isPureBarrel = residue.length === 0;

  return { imports, reexports, dynamic, isPureBarrel };
}

function fileExists(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** Try `<base>` as file, with appended extensions, then as dir with index files. */
function resolveWithExtensions(absBase) {
  if (path.extname(absBase) && fileExists(absBase)) return absBase;
  for (const ext of CODE_EXTENSIONS) {
    if (fileExists(absBase + ext)) return absBase + ext;
  }
  if (fileExists(absBase)) return absBase; // extension-full non-code asset (.css, .svg, .graphql, …)
  for (const idx of INDEX_BASENAMES) {
    const p = path.join(absBase, idx);
    if (fileExists(p)) return p;
  }
  return null;
}

/**
 * Resolve an import specifier to a repo-relative file path, or null when it
 * is external (node_modules) / unresolvable.
 */
export function resolveSpecifier(specifier, fromFileRel, aliases, repoRoot) {
  let absBase = null;
  if (specifier.startsWith('.')) {
    absBase = path.resolve(repoRoot, path.dirname(fromFileRel), specifier);
  } else {
    for (const a of aliases) {
      if (!a.wildcard) {
        if (specifier === a.prefix) {
          absBase = path.resolve(repoRoot, a.target);
          break;
        }
      } else if (
        specifier.startsWith(a.prefix) &&
        specifier.endsWith(a.suffix) &&
        specifier.length > a.prefix.length + a.suffix.length - 1
      ) {
        const star = specifier.slice(
          a.prefix.length,
          specifier.length - a.suffix.length || undefined,
        );
        absBase = path.resolve(repoRoot, a.target.replace('*', star));
        break;
      }
    }
  }
  if (!absBase) return null;
  const resolved = resolveWithExtensions(absBase);
  if (!resolved) return null;
  const rel = path.relative(repoRoot, resolved).split(path.sep).join('/');
  if (rel.startsWith('..') || rel.includes('node_modules/')) return null;
  return rel;
}

const isCodeFile = (rel) => CODE_EXTENSIONS.includes(path.extname(rel));

/**
 * Shared per-repo memo of file → parsed-and-resolved module surface so the
 * per-spec walks never re-parse a file.
 *
 * Resolved shape:
 *   imports:   [{ file, names }]                      (names may be [ALL])
 *   reexports: [{ file, pairs: [{from, to}] | null }] (null = `export * from`)
 *   dynamic:   [file]
 *   isPureBarrel: boolean
 */
export function createResolver(repoRoot, aliases) {
  const memo = new Map();
  return function moduleOf(rel) {
    let cached = memo.get(rel);
    if (cached) return cached;
    let src = '';
    try {
      src = readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      cached = { imports: [], reexports: [], dynamic: [], isPureBarrel: false };
      memo.set(rel, cached);
      return cached;
    }
    const parsed = extractImports(src);
    const resolve = (spec) => resolveSpecifier(spec, rel, aliases, repoRoot);
    cached = {
      imports: parsed.imports
        .map((i) => ({ file: resolve(i.specifier), names: i.names }))
        .filter((i) => i.file),
      reexports: parsed.reexports
        .map((r) => ({
          file: resolve(r.specifier),
          pairs:
            r.names === null
              ? null
              : r.names.map((from, idx) => ({
                  from,
                  to: r.exported?.[idx] ?? from,
                })),
        }))
        .filter((r) => r.file),
      dynamic: [...new Set(parsed.dynamic.map(resolve).filter(Boolean))],
      isPureBarrel: parsed.isPureBarrel,
    };
    memo.set(rel, cached);
    return cached;
  };
}

/**
 * Demand-driven transitive closure over the import graph.
 *
 * A work item is (file, name): "the export `name` of `file` may be used"
 * (name === ALL: the whole module runs). Narrowing rule: demanding one name
 * from a PURE BARREL follows only the matching re-export edge, so
 * `import { useAuth } from '…/entry/auth'` does not drag in every feature the
 * barrel re-exports. Any module with local code conservatively activates all
 * of its own import edges (each narrowed to the names IT imports), because
 * without an AST we cannot know which import its local code uses.
 *
 * @param {Array<string | [string, string]>} entries file, or [file, name]
 * @param {(rel: string) => object} moduleOf resolver from createResolver
 * @param {{ followDynamic: boolean }} opts
 * @returns {Set<string>} every reachable repo file, entries included
 */
export function buildClosure(entries, moduleOf, { followDynamic }) {
  const files = new Set();
  const done = new Set(); // "filename" work-items already processed
  const queue = [];
  for (const e of entries) {
    if (!e) continue;
    queue.push(Array.isArray(e) ? e : [e, ALL]);
  }

  while (queue.length > 0) {
    const [rel, name] = queue.pop();
    const key = `${rel}\u0000${name}`;
    if (done.has(key) || done.has(`${rel}\u0000${ALL}`)) continue;
    done.add(key);
    files.add(rel);
    if (!isCodeFile(rel)) continue; // assets are leaves
    const mod = moduleOf(rel);

    // Re-export edges: follow only what the demand asks for.
    let matchedReexport = false;
    for (const r of mod.reexports) {
      if (name === ALL) {
        queue.push([r.file, ALL]);
      } else if (r.pairs === null) {
        queue.push([r.file, name]); // export * — name may come from here
        matchedReexport = true;
      } else {
        for (const p of r.pairs) {
          if (p.to === name) {
            queue.push([r.file, p.from]);
            matchedReexport = true;
          }
        }
      }
    }

    // Local code activates the module's own imports; a pure barrel has none
    // beyond its re-exports, which the demand above already narrowed. A pure
    // barrel that did NOT satisfy the demand via a re-export (import-then-
    // export-local style) conservatively fires its imports instead.
    if (name === ALL || !mod.isPureBarrel || !matchedReexport) {
      for (const i of mod.imports) {
        for (const n of i.names) queue.push([i.file, n]);
      }
      if (followDynamic) {
        for (const d of mod.dynamic) queue.push([d, ALL]);
      }
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Route extraction from e2e sources
// ---------------------------------------------------------------------------

/** Placeholder marking a template-literal `${…}` hole — matches any one segment. */
export const WILDCARD_SEGMENT = '\u0000';

const GOTO_RE = /(?:([\w$.]+)\s*\.\s*)?(goto(?:App)?|open)\s*\(\s*([^)]*)/g;

/**
 * Only Playwright's own navigation surfaces take a ROUTE argument: bare
 * `goto(…)`, `page.goto(…)`, `driver.goto(…)` (incl. `this.`-prefixed and
 * fixture-suffixed receivers). A page-object method call like
 * `waiversPage.goto(LEAGUE_ID)` takes DATA — its route lives inside the POM
 * body, which is scanned separately as part of the spec's import closure.
 */
function isRouteReceiver(receiver) {
  if (!receiver) return true; // bare goto( — assume route-taking
  const last = receiver.split('.').pop();
  return last === 'page' || last === 'driver';
}
const CONST_STRING_RE = (name) =>
  new RegExp(
    `(?:const|let|var)\\s+${name}\\s*(?::[^=]*)?=\\s*(['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*?)\\1`,
  );

function normalizeRouteArg(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // `async goto(leagueId: number)` — a method DECLARATION, not a call.
  if (/^[\w$]+\s*\??\s*:/.test(trimmed)) return null;
  const first = trimmed[0];
  if (first === "'" || first === '"') {
    const m = trimmed.match(/^(['"])((?:\\.|(?!\1).)*?)\1/);
    return m ? m[2] : { unresolved: trimmed };
  }
  if (first === '`') {
    const m = trimmed.match(/^`((?:\\.|[^`])*?)`/);
    if (!m) return { unresolved: trimmed };
    return m[1].replace(/\$\{[^}]*\}/g, WILDCARD_SEGMENT);
  }
  return { identifier: trimmed.match(/^[\w$.]+/)?.[0] ?? trimmed };
}

/**
 * Extract the route paths a source file visits.
 *
 * Signal strength varies by call:
 *   - `goto`/`gotoApp` on a page/driver receiver → STRONG. A resolved route
 *     that matches no route pattern (or an unresolvable argument) is a
 *     correctness event the caller must react to.
 *   - `open(...)` (BaseScreen/POM navigation wrapper) → WEAK. `open` is a
 *     generic method name, so only literal/const-resolved route strings are
 *     harvested and the caller silently drops any that match no pattern.
 *
 * Identifier arguments resolve against same-file string/template consts. An
 * identifier that is an annotated PARAMETER somewhere in the file (`(path:
 * string`) is skipped: the value flows in from call sites, which are
 * themselves goto/open calls captured in their own files.
 *
 * @returns {{ routes: string[], weakRoutes: string[], unresolved: string[] }}
 */
export function extractRoutes(source) {
  const routes = new Set();
  const weakRoutes = new Set();
  const unresolved = [];
  for (const m of source.matchAll(GOTO_RE)) {
    const isOpen = m[2] === 'open';
    const routeReceiver = !isOpen && isRouteReceiver(m[1]);
    const arg = normalizeRouteArg(m[3]);
    if (arg === null) continue;
    const sink = isOpen ? weakRoutes : routes;
    if (typeof arg === 'string') {
      // A route-shaped LITERAL counts from ANY goto receiver — a Playwright
      // Page under a custom name (`cleanPage.goto('/')`) navigates just the
      // same. The receiver gate below only filters IDENTIFIER args, where a
      // POM receiver means the arg is data, not a route.
      if (arg.startsWith('/') || arg.startsWith(WILDCARD_SEGMENT)) {
        sink.add(arg);
      }
      // absolute http(s) URLs and fragment-only gotos are not app routes
      continue;
    }
    if (!isOpen && !routeReceiver) continue; // POM data args — route lives in the POM body
    if (arg.identifier) {
      const name = arg.identifier.split('.')[0];
      const decl = source.match(CONST_STRING_RE(name));
      if (decl) {
        const value = decl[2].replace(/\$\{[^}]*\}/g, WILDCARD_SEGMENT);
        if (value.startsWith('/') || value.startsWith(WILDCARD_SEGMENT)) {
          sink.add(value);
        }
        continue; // resolved (route or not) — done either way
      }
      if (isOpen) continue; // weak signal — never escalates
      if (new RegExp(`[(,]\\s*${name}\\s*\\??\\s*:`).test(source)) {
        continue; // enclosing-function parameter — call sites carry the route
      }
      unresolved.push(arg.identifier);
      continue;
    }
    if (!isOpen) unresolved.push(String(arg.unresolved).slice(0, 60));
  }
  return {
    routes: [...routes].sort(),
    weakRoutes: [...weakRoutes].sort(),
    unresolved,
  };
}

const ROUTE_LITERAL_RE = /(['"`])(\/(?:\\.|(?!\1).)*?)\1/g;

/**
 * Fallback for specs with statically unresolvable goto arguments: harvest
 * every route-looking string/template literal (starts with `/`) from a
 * source text. Non-route strings that sneak in are harmless — callers only
 * keep literals that actually match a route pattern.
 */
export function extractRouteLiterals(source) {
  const found = new Set();
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(ROUTE_LITERAL_RE)) {
    const value = m[2].replace(/\$\{[^}]*\}/g, WILDCARD_SEGMENT);
    if (value.startsWith('//')) continue; // protocol-relative URL, not a route
    found.add(value);
  }
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Route table from apps/web/src/app/app.tsx
// ---------------------------------------------------------------------------

const LAZY_IMPORT_RE =
  /const\s+(\w+)\s*=\s*(?:lazyWithRetry|React\.lazy|lazy)\s*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g;
const STATIC_IMPORT_BINDINGS_RE =
  /import\s+(?:type\s+)?([\w{},\s*]+?)\s+from\s+['"]([^'"]+)['"]/g;

/**
 * Parse the route table: every `<Route path="…" element={…} />` plus the
 * identifier → module-specifier maps needed to resolve elements to files.
 *
 * @returns {{
 *   routes: Array<{ pattern: string, components: string[] }>,
 *   componentModules: Map<string, string>,
 * }} componentModules maps a component identifier to its import specifier.
 */
export function parseRouteTable(appSource) {
  const componentModules = new Map();
  for (const m of appSource.matchAll(LAZY_IMPORT_RE)) {
    componentModules.set(m[1], m[2]);
  }
  for (const m of appSource.matchAll(STATIC_IMPORT_BINDINGS_RE)) {
    const bindings = m[1];
    const spec = m[2];
    for (const b of bindings.replace(/[{}]/g, '').split(',')) {
      const name = b.replace(/\s+as\s+\w+/, '').trim();
      if (/^[A-Z]\w*$/.test(name) && !componentModules.has(name)) {
        componentModules.set(name, spec);
      }
    }
  }

  // Local declarations (const Foo = … / function Foo(…)) — map the name to
  // the capitalized JSX identifiers used inside its body so e.g. a local
  // NavigableHomeScreen wrapper resolves through to the lazy HomePage import.
  const localBodies = new Map();
  const declRe =
    /^(?:export\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]*)?=)/gm;
  const declMatches = [...appSource.matchAll(declRe)];
  for (let i = 0; i < declMatches.length; i++) {
    const name = declMatches[i][1] ?? declMatches[i][2];
    const start = declMatches[i].index;
    const end =
      i + 1 < declMatches.length ? declMatches[i + 1].index : appSource.length;
    localBodies.set(name, appSource.slice(start, end));
  }

  const routes = [];
  const chunks = appSource.split(/<Route\b/).slice(1);
  for (const chunk of chunks) {
    const head = chunk.slice(0, chunk.indexOf('/>') + 2 || undefined);
    const pathMatch = head.match(/\bpath\s*=\s*["']([^"']+)["']/);
    if (!pathMatch) continue;
    const pattern = pathMatch[1].startsWith('/')
      ? pathMatch[1]
      : `/${pathMatch[1]}`;
    const idents = new Set();
    for (const t of head.matchAll(/<([A-Z]\w*)/g)) idents.add(t[1]);
    routes.push({ pattern, components: [...idents] });
  }

  return { routes, componentModules, localBodies };
}

/**
 * Resolve a route-element identifier to the set of module specifiers it
 * mounts, expanding through local wrapper declarations (bounded depth).
 */
export function resolveComponentSpecifiers(
  name,
  { componentModules, localBodies },
  depth = 0,
  seen = new Set(),
) {
  if (seen.has(name) || depth > 3) return [];
  seen.add(name);
  const specs = [];
  if (componentModules.has(name)) {
    specs.push(componentModules.get(name));
    return specs;
  }
  const body = localBodies.get(name);
  if (body) {
    for (const t of body.matchAll(/<([A-Z]\w*)/g)) {
      specs.push(
        ...resolveComponentSpecifiers(
          t[1],
          { componentModules, localBodies },
          depth + 1,
          seen,
        ),
      );
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

function splitSegments(route) {
  return route.split('?')[0].split('#')[0].split('/').filter(Boolean);
}

/** Does a visited (possibly wildcard-holed) path match a route pattern? */
export function routeMatches(pattern, visited) {
  if (pattern === '*') return true;
  const p = splitSegments(pattern);
  const v = splitSegments(visited);
  if (p[p.length - 1] === '*') {
    if (v.length < p.length - 1) return false;
  } else if (p.length !== v.length) {
    return false;
  }
  for (let i = 0; i < p.length; i++) {
    const ps = p[i];
    if (ps === '*') return true;
    const vs = v[i];
    if (vs === undefined) return false;
    if (ps.includes(':')) continue; // :param (or embedded param) segment
    if (vs.includes(WILDCARD_SEGMENT)) continue; // template hole
    if (ps !== vs) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Spec discovery
// ---------------------------------------------------------------------------

export function findSpecs(repoRoot, specsDirRel) {
  const abs = path.join(repoRoot, specsDirRel);
  return readdirSync(abs, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => `${specsDirRel}/${f.split(path.sep).join('/')}`)
    .sort();
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export const APP_ENTRY = 'apps/web/src/main.tsx';
export const ROUTE_TABLE = 'apps/web/src/app/app.tsx';
export const SPECS_DIR = 'apps/web-e2e/src/tests';

/**
 * Derive the full manifest.
 * @returns {{ manifest: object, stats: { specCount: number, fileRefs: number, warnings: string[] } }}
 */
export function derive({ repoRoot }) {
  const warnings = [];
  const aliases = loadPathAliases(repoRoot);
  const edgesOf = createResolver(repoRoot, aliases);

  // App shell: eager (static-only) closure — executes on every route.
  const shellClosure = buildClosure([APP_ENTRY], edgesOf, {
    followDynamic: false,
  });

  // Route table → per-pattern page-component entry modules.
  const appSource = readFileSync(path.join(repoRoot, ROUTE_TABLE), 'utf8');
  const table = parseRouteTable(appSource);
  const routeEntries = []; // { pattern, files: string[] }
  for (const { pattern, components } of table.routes) {
    const files = new Set();
    for (const c of components) {
      for (const spec of resolveComponentSpecifiers(c, table)) {
        const rel = resolveSpecifier(spec, ROUTE_TABLE, aliases, repoRoot);
        if (rel) files.add(rel);
      }
    }
    routeEntries.push({ pattern, files: [...files] });
  }
  const allPageEntryFiles = [...new Set(routeEntries.flatMap((r) => r.files))];

  // Per-page-module closure cache (static + dynamic).
  const pageClosureCache = new Map();
  const pageClosure = (entry) => {
    let c = pageClosureCache.get(entry);
    if (!c) {
      c = buildClosure([entry], edgesOf, { followDynamic: true });
      pageClosureCache.set(entry, c);
    }
    return c;
  };

  const specs = findSpecs(repoRoot, SPECS_DIR);
  const manifestSpecs = {};
  let fileRefs = 0;

  for (const spec of specs) {
    const reachable = new Set(shellClosure);
    const e2eClosure = buildClosure([spec], edgesOf, { followDynamic: true });
    for (const f of e2eClosure) reachable.add(f);

    // Routes visited by the spec or any e2e-side file it pulls in.
    const routes = new Set();
    const unresolvedGotos = [];
    const e2eSources = new Map();
    for (const f of e2eClosure) {
      if (!f.startsWith('apps/web-e2e/')) continue;
      if (!isCodeFile(f)) continue;
      let src;
      try {
        src = readFileSync(path.join(repoRoot, f), 'utf8');
      } catch {
        continue;
      }
      e2eSources.set(f, src);
      const { routes: r, weakRoutes, unresolved } = extractRoutes(src);
      for (const x of r) routes.add(x);
      for (const w of weakRoutes) {
        // Weak (open-call) routes count only when they match a real pattern.
        if (routeEntries.some((re) => routeMatches(re.pattern, w))) {
          routes.add(w);
        }
      }
      for (const u of unresolved) unresolvedGotos.push(`${f}: ${u}`);
    }

    // Unresolvable goto arguments: before degrading to "every routed page",
    // harvest route-looking literals across the spec's e2e closure — loop
    // arrays (`for (const route of ROUTES)`) and cross-file URL constants
    // live there. Only literals matching a real route pattern count.
    let reachEverything = false;
    if (unresolvedGotos.length > 0) {
      const literalRoutes = new Set();
      for (const src of e2eSources.values()) {
        for (const lit of extractRouteLiterals(src)) {
          if (routeEntries.some((r) => routeMatches(r.pattern, lit))) {
            literalRoutes.add(lit);
          }
        }
      }
      if (literalRoutes.size > 0) {
        for (const lit of literalRoutes) routes.add(lit);
        warnings.push(
          `${spec}: unresolved goto argument(s) [${unresolvedGotos.join('; ')}] — ` +
            `fell back to ${literalRoutes.size} route literal(s) found in the spec's closure`,
        );
      } else {
        reachEverything = true;
        warnings.push(
          `${spec}: unresolved goto argument(s) [${unresolvedGotos.join('; ')}] and no ` +
            `route literals in its closure — spec treated as reaching every routed page`,
        );
      }
    }

    const pageFiles = new Set();
    if (!reachEverything) {
      for (const visited of routes) {
        const matched = routeEntries.filter((r) =>
          routeMatches(r.pattern, visited),
        );
        if (matched.length === 0) {
          warnings.push(
            `${spec}: visited route '${visited.replaceAll(WILDCARD_SEGMENT, '${…}')}' matches no route pattern — spec treated as reaching every routed page`,
          );
          reachEverything = true;
          break;
        }
        for (const r of matched) {
          for (const entry of r.files) {
            for (const f of pageClosure(entry)) pageFiles.add(f);
          }
        }
      }
    }
    if (reachEverything) {
      pageFiles.clear();
      for (const entry of allPageEntryFiles) {
        for (const f of pageClosure(entry)) pageFiles.add(f);
      }
    }
    for (const f of pageFiles) reachable.add(f);

    const files = [...reachable].sort();
    manifestSpecs[spec] = files;
    fileRefs += files.length;
  }

  const manifest = {
    $comment:
      'GENERATED by .github/scripts/e2e-graph/derive-surface-map.mjs (LS-9661) — do not edit. ' +
      'Maps each hermetic Playwright spec to the source files transitively reachable from it ' +
      'through the real module graph (spec imports ∪ app-shell eager closure ∪ visited-route page closures). ' +
      'Consumed by .github/scripts/integration-select/select-specs.mjs; exact paths are valid globs.',
    runAllWhenChanged: [...RUN_ALL_CORE],
    specs: manifestSpecs,
  };

  return {
    manifest,
    stats: { specCount: specs.length, fileRefs, warnings },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    repoRoot: process.cwd(),
    out: null,
    statsOut: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo-root') args.repoRoot = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--stats-out') args.statsOut = argv[++i];
    else if (a === '--quiet') args.quiet = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = process.hrtime.bigint();
  const { manifest, stats } = derive({ repoRoot: path.resolve(args.repoRoot) });
  const elapsedMs = Number((process.hrtime.bigint() - started) / 1000000n);

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, json);
  else process.stdout.write(json);

  if (args.statsOut) {
    writeFileSync(
      args.statsOut,
      `${JSON.stringify({ ...stats, elapsedMs }, null, 2)}\n`,
    );
  }
  if (!args.quiet) {
    log(
      `[derive] ${stats.specCount} spec(s), ${stats.fileRefs} file ref(s), ` +
        `${stats.warnings.length} warning(s), ${elapsedMs}ms`,
    );
    for (const w of stats.warnings) log(`[derive] warning: ${w}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
