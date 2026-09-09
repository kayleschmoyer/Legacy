#!/usr/bin/env node
/**
 * Post-codegen script to fix Apollo Client 4.x compatibility
 *
 * Apollo Client 4.x moved React hooks to '@apollo/client/react' and
 * restructured SuspenseQuery types. The @graphql-codegen/typescript-react-apollo
 * plugin doesn't fully support Apollo 4 yet, so this script:
 *
 * 1. Fixes the Apollo import path to '@apollo/client/react'
 * 2. Adds local type aliases for removed types (MutationFunction, BaseMutationOptions)
 * 3. Removes incompatible SuspenseQuery overload declarations (Apollo 4 changed
 *    the type signatures for SuspenseQueryHookOptions and UseSuspenseQueryResult,
 *    making the codegen-generated overloads invalid). The implementation function
 *    is kept and TypeScript infers the correct return type from Apollo.useSuspenseQuery().
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// --- LS-9872: guard against reading a partially-flushed generated file ---
//
// graphql-codegen's `afterAllFileWrite` hook (this script) is spawned right
// after codegen's own write of `graphql.generated.ts` resolves, but on some
// filesystems/CI runners that write isn't guaranteed to be fully visible to
// a freshly-spawned child process yet. When that race loses, this script
// (or, downstream, `prettier --write`) reads a partial file — observed as
// output truncated mid-identifier, e.g. `export type Lineu` — and happily
// writes that truncation back out, corrupting the generated file. Re-running
// codegen on the identical commit succeeds, which is the signature of a
// write/flush race, not a schema or codegen-config problem.
//
// `readGeneratedFileWithRetry` below re-reads and syntax-checks the file a
// few times before giving up, so a lagging write self-heals instead of
// getting fixed-up and prettified into a permanently broken file. If it's
// still truncated after all retries, it throws a `TruncatedGeneratedFileError`
// with a message that says so explicitly — never letting the corrupt content
// reach `prettier --write`, whose resulting SyntaxError would otherwise look
// like a codegen config bug rather than what it actually is.
const TRUNCATION_RETRY_ATTEMPTS = 5;
const TRUNCATION_RETRY_BASE_DELAY_MS = Number(
  process.env.FIX_APOLLO_CODEGEN_RETRY_DELAY_MS || 60,
);

class TruncatedGeneratedFileError extends Error {}

// Synchronous sleep (no async/await plumbing needed through processFile's
// call chain, and the retry only ever runs from a one-shot CLI script).
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

// A generated file that's been cut off mid-write is, by construction, not
// syntactically valid TypeScript (e.g. `export type Lineu` has no closing
// declaration). Parsing it and checking for parse errors catches that
// directly, rather than guessing at heuristics like "ends with a semicolon".
function looksTruncated(content) {
  if (content.trim().length === 0) {
    return true;
  }
  const sourceFile = ts.createSourceFile(
    'graphql.generated.ts',
    content,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  return (sourceFile.parseDiagnostics || []).length > 0;
}

function readGeneratedFileWithRetry(fullPath, filePath) {
  let content = '';
  for (let attempt = 1; attempt <= TRUNCATION_RETRY_ATTEMPTS; attempt++) {
    content = fs.readFileSync(fullPath, 'utf8');
    if (!looksTruncated(content)) {
      return content;
    }
    if (attempt < TRUNCATION_RETRY_ATTEMPTS) {
      console.warn(
        `⚠️  ${filePath} appears truncated (attempt ${attempt}/${TRUNCATION_RETRY_ATTEMPTS}) — ` +
          `this looks like the codegen write/flush race (LS-9872), not a schema or config problem. Retrying read...`,
      );
      sleepSync(TRUNCATION_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw new TruncatedGeneratedFileError(
    `${filePath} still appears truncated after ${TRUNCATION_RETRY_ATTEMPTS} read retries. ` +
      `This is the codegen write/flush race (LS-9872) — the generated file was still being ` +
      `written when this hook read it, and never caught up. Re-run codegen for this project; ` +
      `this is not a schema or codegen-config bug.`,
  );
}

// fs.writeFileSync + fsync so the bytes are durably flushed before the next
// hook in the chain (`prettier --write`) reads this same file back.
function writeFileSynced(fullPath, content) {
  const fd = fs.openSync(fullPath, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Files to fix (relative to workspace root)
const FILES_TO_FIX = [
  // Canonical, monorepo-wide GraphQL operations/hooks (web, app, shared-components
  // all consume this single generated module via @legacy-sports/graphql).
  'lib/graphql/src/graphql.generated.ts',
  // Backend / non-React-bundle packages keep their own generated files.
  'lib/bref-client/src/api/db/graphql.generated.ts',
  'lib/data-loaders/src/api/db/graphql.generated.ts',
  'lib/api/src/api/db/graphql.generated.ts',
  'lib/api/src/shared/graphql.generated.ts',
  'apps/cli/src/api/db/graphql.generated.ts',
];

function fixApolloImports(content) {
  // Remove duplicate compatibility type blocks (from previous script runs)
  const compatibilityBlockPattern =
    /\/\/ Apollo Client 4\.x compatibility: these types are no longer exported\s*\ntype MutationFunction<TData, TVariables> = \(variables\?: TVariables\) => Promise<any>;\s*\ntype BaseMutationOptions<TData, TVariables> = any;\s*\n/g;

  const matches = content.match(compatibilityBlockPattern);
  if (matches && matches.length > 1) {
    let first = true;
    content = content.replace(compatibilityBlockPattern, (match) => {
      if (first) {
        first = false;
        return match;
      }
      return '';
    });
  }

  // --- Fix Apollo import path ---
  const importPattern1 =
    /import \* as ApolloReactCommon from '@apollo\/client\/react';\s*\nimport \* as Apollo from '@apollo\/client';/;
  const importPattern2 = /import \* as Apollo from '@apollo\/client\/react';/;
  const importPattern3 = /import \* as Apollo from '@apollo\/client';/;

  const fixedImport = `import * as Apollo from '@apollo/client/react';

// Apollo Client 4.x compatibility: these types are no longer exported
type MutationFunction<TData, TVariables> = (variables?: TVariables) => Promise<any>;
type BaseMutationOptions<TData, TVariables> = any;`;

  const hasCompatibilityTypes = content.includes(
    '// Apollo Client 4.x compatibility: these types are no longer exported',
  );

  if (importPattern1.test(content)) {
    content = content.replace(
      importPattern1,
      hasCompatibilityTypes
        ? "import * as Apollo from '@apollo/client/react';"
        : fixedImport,
    );
  } else if (importPattern2.test(content)) {
    if (!hasCompatibilityTypes) {
      content = content.replace(importPattern2, fixedImport);
    }
  } else if (importPattern3.test(content)) {
    content = content.replace(
      importPattern3,
      hasCompatibilityTypes
        ? "import * as Apollo from '@apollo/client/react';"
        : fixedImport,
    );
  }

  // --- Fix type references ---
  content = content.replace(/ApolloReactCommon\./g, 'Apollo.');
  content = content.replace(/Apollo\.MutationFunction/g, 'MutationFunction');
  content = content.replace(
    /Apollo\.BaseMutationOptions/g,
    'BaseMutationOptions',
  );

  // --- Remove incompatible SuspenseQuery overloads ---
  // Apollo 4 restructured SuspenseQueryHookOptions and UseSuspenseQueryResult
  // so the codegen-generated overloads produce TS2394/TS2769 errors.
  // We remove the overload declarations and keep only the implementation.
  // The // @ts-ignore + overload lines (ending in ;) before the implementation
  // are matched and removed. Each overload's parameter/return types can span
  // multiple lines, so `[\s\S]*?` (not `.`) is required to cross newlines —
  // a same-line `.*` regex silently fails to match wrapped signatures and
  // leaves the @ts-ignore suppressions in place.
  content = content.replace(
    /\/\/ @ts-ignore\nexport function (use\w+SuspenseQuery)\([\s\S]*?;\nexport function \1\([\s\S]*?;\n/g,
    '',
  );

  // --- Fix SuspenseQuery implementation for Apollo 4 type compatibility ---
  // The codegen spreads {…defaultOptions, …baseOptions} which widens
  // `variables` to optional, but Apollo 4's useSuspenseQuery requires
  // `variables` to be non-optional for queries with required variables.
  // We add a targeted type assertion on the options argument so the rest
  // of the file remains fully type-checked (unlike @ts-nocheck).
  //
  // Handle both patterns:
  // 1. Original codegen ternary: const options = ... ? ... : {...}; return Apollo.useSuspenseQuery(..., options);
  // 2. Previous fix if/return: if (baseOptions === ...) return ...; return Apollo.useSuspenseQuery(..., {...});
  content = content.replace(
    /const options = baseOptions === Apollo\.skipToken \? baseOptions : \{\.\.\.defaultOptions, \.\.\.baseOptions\}\s*\n(\s*)return Apollo\.useSuspenseQuery<(\w+), (\w+)>\((\w+), options\);/g,
    'const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}\n$1return Apollo.useSuspenseQuery<$2, $3>($4, options as Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<$2, $3>);',
  );
  content = content.replace(
    /if \(baseOptions === Apollo\.skipToken\) return Apollo\.useSuspenseQuery<(\w+), (\w+)>\((\w+), Apollo\.skipToken\);\s*\n(\s*)return Apollo\.useSuspenseQuery<\1, \2>\(\3, \{\.\.\.defaultOptions, \.\.\.baseOptions\}\);/g,
    'const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}\n$4return Apollo.useSuspenseQuery<$1, $2>($3, options as Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<$1, $2>);',
  );

  // Remove any leftover @ts-nocheck comments from previous script versions
  content = content.replace(/\/\/ @ts-nocheck[^\n]*\n/g, '');

  return content;
}

// This script's own directory is <workspaceRoot>/scripts, so its parent is
// the workspace root regardless of the caller's cwd.
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

function processFile(filePath) {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  // The hook that invokes this script (see codegen.ts / codegen.base.ts)
  // passes graphql-codegen's own output filenames, so this should never
  // resolve outside the workspace — but process.argv is still
  // caller-controlled input, so guard against a path (e.g. `../../../etc/x`)
  // that escapes the workspace root before touching the filesystem.
  const relativeToRoot = path.relative(WORKSPACE_ROOT, fullPath);
  const escapesRoot =
    relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot);
  if (escapesRoot) {
    console.error(
      `❌ Refusing to process ${filePath}: resolves outside the workspace root (${fullPath})`,
    );
    return false;
  }

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${filePath} (not found)`);
    return false;
  }

  try {
    const content = readGeneratedFileWithRetry(fullPath, filePath);
    const fixed = fixApolloImports(content);

    if (content !== fixed) {
      writeFileSynced(fullPath, fixed);
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No changes needed: ${filePath}`);
      return false;
    }
  } catch (error) {
    if (error instanceof TruncatedGeneratedFileError) {
      // Re-thrown (not swallowed): a truncated file must hard-fail this
      // hook so `prettier --write` never runs on it — see LS-9872 above.
      console.error(`❌ ${error.message}`);
      throw error;
    }
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main(argv) {
  console.log('\n🔧 Fixing Apollo Client 4.x imports in generated files...\n');

  // graphql-codegen's `afterAllFileWrite` hook (see codegen.ts / codegen.base.ts)
  // passes the file(s) that specific codegen run just wrote as CLI args. When
  // called that way, fix only those files — not the full FILES_TO_FIX list.
  //
  // This matters because `nx run-many -t codegen` runs multiple packages'
  // codegen targets concurrently (nx.json parallel: 5), and each package's
  // hook used to unconditionally rewrite ALL FILES_TO_FIX regardless of which
  // file it actually generated. That meant several Node processes performed
  // unsynchronized read-modify-write passes over the *same* shared generated
  // files at the same time, and a write from one process could land mid-read
  // (or mid-write) of another, truncating/corrupting the file into invalid
  // TypeScript (LS-9958). Scoping to the caller's own file(s) removes the
  // cross-package race entirely.
  //
  // With no args (e.g. `pnpm run codegen:fix-apollo` invoked directly), fall
  // back to fixing every known generated file.
  const files = argv.length > 0 ? argv : FILES_TO_FIX;

  let fixedCount = 0;

  for (const file of files) {
    const result = processFile(file);
    if (result) fixedCount++;
  }

  console.log(`\n✨ Done! Fixed ${fixedCount} file(s)\n`);

  return 0;
}

// Run if called directly
if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    // A TruncatedGeneratedFileError (LS-9872) or any other failure here
    // must stop the hook chain with a message that says what actually
    // happened — otherwise `prettier --write` runs next on a corrupt file
    // and its resulting SyntaxError is the only thing anyone sees.
    console.error(`\n❌ codegen:fix-apollo failed: ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  fixApolloImports,
  processFile,
  main,
  FILES_TO_FIX,
  looksTruncated,
  readGeneratedFileWithRetry,
  TruncatedGeneratedFileError,
};
