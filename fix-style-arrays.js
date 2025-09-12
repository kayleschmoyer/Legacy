#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Function to find and replace style array filter patterns
function fixStyleArrays(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Pattern 1: [style1, style2].filter(Boolean) -> safeStyle([style1, style2])
  let newContent = content.replace(
    /(\[[\s\S]*?\])\.filter\(Boolean\)/g,
    (match, styleArray) => {
      modified = true;
      return `safeStyle(${styleArray})`;
    },
  );

  // Pattern 2: [style1, condition && style2] where TypeScript complains
  // We'll handle this by wrapping in safeStyle
  newContent = newContent.replace(
    /style=\{(\[[\s\S]*?\])\}/g,
    (match, styleArray) => {
      // Check if the array contains conditions that might result in false values
      if (
        styleArray.includes('&&') ||
        styleArray.includes('?') ||
        styleArray.includes('false')
      ) {
        modified = true;
        return `style={safeStyle(${styleArray})}`;
      }
      return match;
    },
  );

  // Add import if we made modifications and don't already have it
  if (modified && !content.includes('import { safeStyle }')) {
    // Find existing imports from utils/styles or add new import
    if (content.includes("from '../../utils/styles'")) {
      newContent = newContent.replace(
        /import { (.*?) } from '\.\.\/\.\.\/utils\/styles'/,
        (match, imports) => {
          if (!imports.includes('safeStyle')) {
            return `import { ${imports}, safeStyle } from '../../utils/styles'`;
          }
          return match;
        },
      );
    } else {
      // Add new import after other imports
      const importSection = newContent.match(/(import[\s\S]*?;\n)/g);
      if (importSection) {
        const lastImport = importSection[importSection.length - 1];
        newContent = newContent.replace(
          lastImport,
          lastImport + "import { safeStyle } from '../../utils/styles';\n",
        );
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

// Find all TypeScript and TSX files in shared-components
const files = glob.sync(
  'c:/code/legacy-sports/lib/shared-components/src/**/*.{ts,tsx}',
  {
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
  },
);

console.log(`Processing ${files.length} files...`);

files.forEach((file) => {
  try {
    fixStyleArrays(file);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log('Done!');
