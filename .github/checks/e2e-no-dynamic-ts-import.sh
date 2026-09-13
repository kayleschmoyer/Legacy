#!/usr/bin/env bash
set -euo pipefail

# LS-10132 (follow-up guard for LS-10033): forbid a raw dynamic `import()` of a
# project-relative `.ts` module under apps/web-e2e/src/.
#
# Playwright registers its TS-aware Node ESM loader (`node:module.register`, see
# common/esmLoaderHost.js) only in the process that calls `loadConfig()` while
# reading the config. Test WORKER processes load their config via
# `deserializeConfig()` and never register it, so a worker-executed `import()`
# of a project `.ts` file falls through to Node's raw ESM loader, which cannot
# parse `.ts`/`import` syntax under this CommonJS-default project:
#
#   SyntaxError: Cannot use import statement outside a module
#
# Three sites carried this defect (fixtures/dual.ts via LS-10033;
# driver/contract/driver.native.spec.ts and
# driver/contract/draft-reference.native.spec.ts via LS-10132) and every one was
# latent for months because the code sat behind an emulator gate that never
# opened in CI. This check exists so a fourth cannot be introduced silently.
#
# Use `createRequire(__filename)` for an intentionally-lazy load instead — it
# reuses Playwright's always-installed CommonJS require-hook:
#
#   const requireFromHere = createRequire(__filename);
#   const { thing } = requireFromHere('./mod') as typeof import('./mod');
#
# Scope, deliberately narrow enough to stay false-positive-free:
#   - Only RUNTIME dynamic imports — `await import('...')` and
#     `import('...').then(...)`. A TYPE-position import (`page: import('./x').Y`,
#     `typeof import('./x')`, a JSDoc `{@link import('./x').Y}`) is erased at
#     compile time, never executes in a worker, and is the documented
#     replacement idiom, so it is not a violation.
#   - Only relative specifiers. A bare package specifier (`import('zod')`)
#     resolves through node_modules and is fine.
#   - Not a real `.mjs`/`.cjs`/`.js`/`.json` target — e.g. global-setup.ts's
#     `import()` of scripts/e2e-auth.mjs, which Node's ESM loader handles
#     correctly and which LS-10132 explicitly leaves alone.
echo "Checking for raw dynamic import() of project .ts modules under apps/web-e2e/src/..."

SEARCH_DIR="apps/web-e2e/src"

if [ ! -d "$SEARCH_DIR" ]; then
  echo "$SEARCH_DIR not found — nothing to check"
  exit 0
fi

# Two runtime shapes, both anchored on a relative specifier:
#   await import('../x')      → AWAITED
#   import('../x').then(...)  → THENED
# Anything ending in an explicitly non-TS runtime extension is dropped
# afterwards; every other relative specifier resolves to a project .ts.
AWAITED="await[[:space:]]+import\([[:space:]]*['\"]\.\.?/"
THENED="[^a-zA-Z0-9_$.]import\([[:space:]]*['\"]\.\.?/[^'\"]*['\"][[:space:]]*\)[[:space:]]*\.then"

# A bare `$(grep ... || true)` would make this check pass VACUOUSLY if grep
# itself errored (bad regex, unreadable path — exit status >1) rather than
# simply finding nothing (status 1). Separate the two so a broken guard fails
# loudly instead of silently reporting "no violations".
set +e
MATCHES=$(grep -rnE "$AWAITED|$THENED" \
  --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules \
  "$SEARCH_DIR")
GREP_STATUS=$?
set -e

if [ "$GREP_STATUS" -gt 1 ]; then
  echo "ERROR: grep failed with status $GREP_STATUS while scanning $SEARCH_DIR." >&2
  echo "This check cannot report a result — failing rather than passing silently." >&2
  exit 1
fi

# Status 1 means no matches at all, so there is nothing left to filter.
if [ "$GREP_STATUS" -eq 1 ]; then
  echo "No raw dynamic import() of project .ts modules found"
  exit 0
fi

# grep -v exits 1 when it filters everything out, which here is a legitimate
# "all matches were excluded" — hence `|| true` is correct on this one.
VIOLATIONS=$(printf '%s\n' "$MATCHES" \
  | grep -vE "['\"][^'\"]*\.(mjs|cjs|js|json)['\"]" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "Found raw dynamic import() of project-relative .ts module(s):"
  echo "$VIOLATIONS"
  echo ""
  echo "A Playwright test worker cannot parse a .ts file loaded this way"
  echo '("SyntaxError: Cannot use import statement outside a module").'
  echo "Use a static import, or for an intentionally-lazy load:"
  echo ""
  echo "  import { createRequire } from 'node:module';"
  echo "  const requireFromHere = createRequire(__filename);"
  echo "  const { thing } = requireFromHere('./mod') as typeof import('./mod');"
  echo ""
  echo "See apps/web-e2e/src/fixtures/dual.ts (LS-10033 / LS-10132)."
  exit 1
fi

echo "No raw dynamic import() of project .ts modules found"
