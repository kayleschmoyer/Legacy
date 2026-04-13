#!/usr/bin/env node
// Storybook story scaffolder: generates a boilerplate story file for a component.
// Creates the story with correct imports, Meta/StoryObj types, and variant stubs.
//
// Usage:
//   node scripts/scaffold-story.js apps/web/src/components/MyWidget.tsx
//   node scripts/scaffold-story.js lib/shared-components/src/MyButton.tsx
//   node scripts/scaffold-story.js --json apps/web/src/components/MyWidget.tsx
//
// Creates: <component-dir>/<ComponentName>.stories.tsx

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve, basename, dirname, relative, extname } = require('path');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const componentPath = args.find((a) => !a.startsWith('--'));

if (!componentPath) {
  console.error('Usage: node scripts/scaffold-story.js <component-path>');
  process.exit(2);
}

const absPath = resolve(root, componentPath);
if (!existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(2);
}

// Extract component name from filename
const ext = extname(componentPath);
const componentName = basename(componentPath, ext);
const componentDir = dirname(absPath);
const storyPath = resolve(componentDir, `${componentName}.stories.tsx`);

if (existsSync(storyPath)) {
  const msg = `Story already exists: ${relative(root, storyPath)}`;
  if (jsonMode) {
    console.log(JSON.stringify({ error: msg, exists: true }));
  } else {
    console.error(`⚠️  ${msg}`);
  }
  process.exit(1);
}

// Read the source file to detect exported props type
const source = readFileSync(absPath, 'utf8');
const propsMatch = source.match(/(?:interface|type)\s+((\w+)Props)\s/);
const propsType = propsMatch ? propsMatch[1] : null;
const hasDefaultExport = /export\s+default\s/.test(source);

// Detect if this is a shared component
const isSharedComponent = componentPath.includes('lib/shared-components');

// Derive story title category from directory structure to match existing conventions
// Examples: src/components/Button → Components/Button, src/features/draft/DraftTimer → Features/Draft/DraftTimer
function deriveStoryTitle() {
  const relPath = relative(root, componentDir).replace(/\\/g, '/');
  const parts = relPath.split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx >= 0 && srcIdx < parts.length - 1) {
    const categoryParts = parts.slice(srcIdx + 1);
    // Capitalize each segment
    const title = categoryParts
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('/');
    return `${title}/${componentName}`;
  }
  return `${isSharedComponent ? 'Shared' : 'Web'}/${componentName}`;
}

// Build import path (relative from story file to component)
const importPath = `./${componentName}`;
const componentImport = hasDefaultExport
  ? `import ${componentName} from '${importPath}';`
  : `import { ${componentName} } from '${importPath}';`;

// Generate the story content (TamaguiProvider is handled by .storybook/preview.ts globally)
const story = `import type { Meta, StoryObj } from '@storybook/react';
${componentImport}

const meta: Meta<typeof ${componentName}> = {
  title: '${deriveStoryTitle()}',
  component: ${componentName},
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithData: Story = {
  args: {
    // TODO: Add props with sample data
  },
};
`;

writeFileSync(storyPath, story, 'utf8');

const relStoryPath = relative(root, storyPath);
if (jsonMode) {
  console.log(
    JSON.stringify({
      created: relStoryPath,
      componentName,
      propsType,
      hasDefaultExport,
    }),
  );
} else {
  console.log(`✅ Created ${relStoryPath}`);
  console.log(`   Component: ${componentName}`);
  if (propsType) {
    console.log(`   Props type: ${propsType}`);
  }
  console.log(`\n   Next: Review and customize the generated stories.`);
}
