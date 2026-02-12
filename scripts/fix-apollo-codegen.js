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

// Files to fix (relative to workspace root)
const FILES_TO_FIX = [
  'lib/shared-components/src/api/db/graphql.generated.ts',
  'lib/bref-client/src/api/db/graphql.generated.ts',
  'lib/data-loaders/src/api/db/graphql.generated.ts',
  'lib/api/src/api/db/graphql.generated.ts',
  'apps/web/src/api/db/graphql.generated.ts',
  'apps/cli/src/api/db/graphql.generated.ts',
  'apps/app/src/api/db/graphql.generated.ts',
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
  // are matched and removed.
  content = content.replace(
    /\/\/ @ts-ignore\nexport function (use\w+SuspenseQuery)\(.*;\nexport function \1\(.*;\n/g,
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

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${filePath} (not found)`);
    return false;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const fixed = fixApolloImports(content);

    if (content !== fixed) {
      fs.writeFileSync(fullPath, fixed, 'utf8');
      console.log(`✅ Fixed: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  No changes needed: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('\n🔧 Fixing Apollo Client 4.x imports in generated files...\n');

  let fixedCount = 0;

  for (const file of FILES_TO_FIX) {
    const result = processFile(file);
    if (result) fixedCount++;
  }

  console.log(`\n✨ Done! Fixed ${fixedCount} file(s)\n`);

  return 0;
}

// Run if called directly
if (require.main === module) {
  process.exit(main());
}

module.exports = { fixApolloImports, processFile };
