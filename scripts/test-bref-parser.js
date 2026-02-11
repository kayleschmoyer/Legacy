#!/usr/bin/env node
/**
 * Test parsing the actual Baseball-Reference HTML to verify game_identifier extraction
 */

const fs = require('fs');
const htmlParser = require('node-html-parser').default;

const htmlFile = 'tmp/sample_bref_file.html';
const html = fs.readFileSync(htmlFile, 'utf-8');
const root = htmlParser(html);

const table = root.querySelector('table#players_standard_batting');
if (!table) {
  console.error('❌ Could not find table#players_standard_batting');
  process.exit(1);
}

console.log('✅ Found table\n');

const allRows = table.querySelectorAll('tr');
console.log(`Found ${allRows.length} rows\n`);

// Test first 5 game rows
let gameCount = 0;
for (const row of allRows) {
  // Look for ranker cell (game number)
  const rankerCell = row.querySelector('th[data-stat="ranker"]');
  if (!rankerCell || !rankerCell.text || rankerCell.text === 'Rk') {
    continue;
  }

  const gameNumber = parseInt(rankerCell.text, 10);
  if (isNaN(gameNumber)) {
    continue;
  }

  gameCount++;
  if (gameCount > 5) break;

  console.log(`Game ${gameNumber}:`);

  // Try to find date cell with date_game
  const dateGameCell = row.querySelector('td[data-stat="date_game"]');
  console.log(`  date_game cell: ${dateGameCell ? 'FOUND' : 'NOT FOUND'}`);

  // Try to find date cell with just "date"
  const dateCell = row.querySelector('td[data-stat="date"]');
  console.log(`  date cell: ${dateCell ? 'FOUND' : 'NOT FOUND'}`);

  if (dateCell) {
    const link = dateCell.querySelector('a');
    if (link) {
      const href = link.getAttribute('href');
      console.log(`  href: ${href}`);

      const GAME_IDENTIFIER_REGEX =
        /^\/boxes\/\w{3}\/(?<gameIdentifier>\w{12}).shtml$/;
      const match = href?.match(GAME_IDENTIFIER_REGEX);
      if (match && match.groups) {
        console.log(
          `  ✅ Extracted game_identifier: ${match.groups.gameIdentifier}`,
        );
      } else {
        console.log(`  ❌ Regex didn't match`);
      }
    } else {
      console.log(`  No <a> tag found in date cell`);
    }
  }

  console.log();
}

console.log(`\nTotal game rows found: ${gameCount}`);
