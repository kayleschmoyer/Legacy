'use strict';
const fs = require('fs');
const path = require('path');

const src = path.resolve(
  __dirname,
  '../../../legacy-sports/apps/web/src/components/EliteDraftBoard.tsx',
);
const stylesOut = path.resolve(
  __dirname,
  '../apps/web/src/components/EliteDraftBoard/styles.ts',
);

const text = fs.readFileSync(src, 'utf8');
const lines = text.split('\n');

// Find the `const CSS = `` ` `` line
const cssStartDecl = lines.findIndex((l) => l.startsWith('const CSS = `'));
console.log(
  'CSS declaration at index (0-based):',
  cssStartDecl,
  '(line ' + (cssStartDecl + 1) + ')',
);

// CSS body starts on the next line
const cssBodyStart = cssStartDecl + 1;

// Find the closing backtick (`;` after the template literal)
let cssEnd = -1;
for (let i = cssBodyStart; i < lines.length; i++) {
  const trimmed = lines[i].trim().replace(/\r/g, '');
  if (trimmed === '`;') {
    cssEnd = i; // index of the line with ``;
    break;
  }
}
console.log(
  'CSS ends (closing `` ` ``; line) at index (0-based):',
  cssEnd,
  '(line ' + (cssEnd + 1) + ')',
);

const cssBodyLines = lines.slice(cssBodyStart, cssEnd); // exclude the closing `` ` ``;
console.log('CSS body lines count:', cssBodyLines.length);

const header = [
  '// ---------------------------------------------------------------------------',
  '// Component-scoped CSS for EliteDraftBoard',
  '// ---------------------------------------------------------------------------',
  '',
  'export const CSS = `',
].join('\n');

const footer = '`;';

const output = header + '\n' + cssBodyLines.join('\n') + '\n' + footer;
fs.writeFileSync(stylesOut, output, 'utf8');
console.log('styles.ts written. Total lines:', output.split('\n').length);
