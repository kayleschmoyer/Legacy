// Test the game identifier regex with sample data from Baseball-Reference

const GAME_IDENTIFIER_GROUP = 'gameIdentifier';
const GAME_IDENTIFIER_REGEX = new RegExp(
  `^\\/boxes\\/\\w{3}\\/(?<${GAME_IDENTIFIER_GROUP}>\\w{12}).shtml$`,
);

const testUrls = [
  '/boxes/BSN/BSN190704200.shtml', // Game 1
  '/boxes/NY1/NY1190705040.shtml', // Game 2
  '/boxes/NY1/NY1190705230.shtml', // Game 3
  '/boxes/NY1/NY1190705240.shtml', // Game 4
  '/boxes/NY1/NY1190705290.shtml', // Game 5
  '/boxes/NY1/NY1190705301.shtml', // Game 6 (doubleheader)
];

console.log('Testing GAME_IDENTIFIER_REGEX:');
console.log(`Regex: ${GAME_IDENTIFIER_REGEX}\n`);

for (const url of testUrls) {
  const match = url.match(GAME_IDENTIFIER_REGEX);
  if (match && match.groups) {
    console.log(`✅ ${url}`);
    console.log(`   -> ${match.groups.gameIdentifier}\n`);
  } else {
    console.log(`❌ ${url}`);
    console.log(`   -> NO MATCH\n`);
  }
}
