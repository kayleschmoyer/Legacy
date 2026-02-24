/**
 * print-schema.ts
 *
 * Generates the canonical GraphQL SDL file (`schema.graphql`) from the Pothos
 * schema implementation in `src/schema/index.ts`.
 *
 * Run via the Nx target:
 *   pnpm exec nx run db:print-schema
 *
 * In CI the generated output is diffed against the committed `schema.graphql`
 * to ensure schema changes are always tracked in version control.
 */

import { lexicographicSortSchema, printSchema } from 'graphql';
import * as prettier from 'prettier';
import * as fs from 'fs';
import * as path from 'path';

// Import the fully-assembled Pothos schema.
// createDatabaseService() is called lazily inside builder.ts — it only opens a
// real connection when a resolver calls `context.db`, so this import is safe in
// environments without database credentials.
import { schema } from '../src/schema/index';

const outputPath = path.resolve(__dirname, '..', 'schema.graphql');

// Sort the schema lexicographically before printing so that types, fields,
// arguments, and enum values are always in deterministic alphabetical order.
// This prevents merge conflicts when multiple branches independently add or
// modify different parts of the schema.
const sdl = printSchema(lexicographicSortSchema(schema));

void (async () => {
  // Resolve the workspace prettier config and format the SDL as GraphQL.
  const prettierConfig = await prettier.resolveConfig(outputPath);
  const formatted = await prettier.format(sdl, {
    ...prettierConfig,
    parser: 'graphql',
  });

  // Write alongside project.json so it is easy to find and review.
  fs.writeFileSync(outputPath, formatted, 'utf-8');

  console.log(`✅  Schema written to ${outputPath}`);
})();
