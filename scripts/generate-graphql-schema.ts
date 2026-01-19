import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { printSchema } from 'graphql';
const repoRoot = resolve(__dirname, '..');
const outputPath = resolve(
  repoRoot,
  'tmp',
  'generated',
  'graphql-schema.graphql',
);

async function main(): Promise<void> {
  try {
    const { schema } = await import('../lambdas/db/src/schema');

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, printSchema(schema), 'utf8');

    console.log(`📝 Wrote GraphQL schema SDL to ${outputPath}`);
  } catch (error) {
    console.error('❌ Failed to generate GraphQL schema:', error);
    process.exitCode = 1;
  }
}

void main();
