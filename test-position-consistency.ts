/**
 * Test Position Logic Consistency Between Draft Processor and GraphQL API
 * 
 * This script validates that the draft processor uses identical position 
 * mapping logic as the GraphQL API's PositionModels.
 */

// Import the GraphQL API's position constants
import { ALLOWED_POSITIONS as GRAPHQL_ALLOWED_POSITIONS } from './lib/shared-components/src/utils/PositionModels';

// Draft processor's position constants (copied from index.ts)
const DRAFT_ALLOWED_POSITIONS = Object.freeze({
  '1B': ['1B'],
  '2B': ['2B'], 
  '3B': ['3B'],
  'C': ['C'],
  'CF': ['CF'],
  'DH': ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'], // DH can be any position player
  'IF': ['1B', '2B', '3B', 'SS'],
  'LF': ['LF'],
  'OF': ['LF', 'RF', 'CF'],
  'RF': ['RF'],
  'RP': ['RP', 'P'], // Relief pitchers include generic P
  'SP': ['SP', 'P'], // Starting pitchers include generic P  
  'SS': ['SS'],
  'XDH': ['DH'],
} as const);

// Draft processor's position checking function (copied from index.ts)
function draftCanPlayerPlayPosition(playerEligiblePositions: string[], requiredPosition: string): boolean {
  const allowedPositions = DRAFT_ALLOWED_POSITIONS[requiredPosition as keyof typeof DRAFT_ALLOWED_POSITIONS];
  
  if (!allowedPositions) {
    return false;
  }

  for (const pos of allowedPositions) {
    if (playerEligiblePositions.includes(pos)) {
      return true;
    }
  }
  
  return false;
}

// GraphQL API's position checking function (simplified version)
function graphqlCanPlayerPlayPosition(playerEligiblePositions: string[], requiredPosition: string): boolean {
  const allowedPositions = GRAPHQL_ALLOWED_POSITIONS[requiredPosition as keyof typeof GRAPHQL_ALLOWED_POSITIONS];
  
  if (!allowedPositions) {
    return false;
  }

  for (const pos of allowedPositions) {
    if (playerEligiblePositions.includes(pos)) {
      return true;
    }
  }
  
  return false;
}

// Test scenarios
const testCases = [
  // Basic position matching
  { playerPositions: ['1B'], requiredPosition: '1B', description: 'First baseman plays 1B' },
  { playerPositions: ['SP'], requiredPosition: 'SP', description: 'Starting pitcher plays SP' },
  { playerPositions: ['RP'], requiredPosition: 'RP', description: 'Relief pitcher plays RP' },
  
  // Utility positions
  { playerPositions: ['1B'], requiredPosition: 'IF', description: '1B can play IF utility' },
  { playerPositions: ['2B'], requiredPosition: 'IF', description: '2B can play IF utility' },
  { playerPositions: ['LF'], requiredPosition: 'OF', description: 'LF can play OF utility' },
  { playerPositions: ['RF'], requiredPosition: 'OF', description: 'RF can play OF utility' },
  
  // DH flexibility  
  { playerPositions: ['1B'], requiredPosition: 'DH', description: '1B can DH' },
  { playerPositions: ['C'], requiredPosition: 'DH', description: 'C can DH' },
  { playerPositions: ['LF'], requiredPosition: 'DH', description: 'LF can DH' },
  { playerPositions: ['DH'], requiredPosition: 'XDH', description: 'DH can play XDH slot' },
  
  // Pitcher flexibility
  { playerPositions: ['P'], requiredPosition: 'SP', description: 'Generic P can start' },
  { playerPositions: ['P'], requiredPosition: 'RP', description: 'Generic P can relieve' },
  
  // Negative cases
  { playerPositions: ['SP'], requiredPosition: '1B', description: 'SP cannot play 1B' },
  { playerPositions: ['1B'], requiredPosition: 'SP', description: '1B cannot pitch' },
  { playerPositions: ['LF'], requiredPosition: '2B', description: 'LF cannot play 2B' },
];

console.log('=== Position Logic Consistency Test ===\\n');

let passedTests = 0;
let totalTests = 0;

// Compare ALLOWED_POSITIONS constants
console.log('🔍 Comparing ALLOWED_POSITIONS constants...\\n');

const allPositions = new Set([
  ...Object.keys(GRAPHQL_ALLOWED_POSITIONS),
  ...Object.keys(DRAFT_ALLOWED_POSITIONS)
]);

let constantsMatch = true;
for (const position of allPositions) {
  const graphqlPositions = GRAPHQL_ALLOWED_POSITIONS[position] || [];
  const draftPositions = DRAFT_ALLOWED_POSITIONS[position as keyof typeof DRAFT_ALLOWED_POSITIONS] || [];
  
  const graphqlSorted = [...graphqlPositions].sort().join(',');
  const draftSorted = [...draftPositions].sort().join(',');
  
  if (graphqlSorted !== draftSorted) {
    console.log(`❌ Position ${position}:`);
    console.log(`   GraphQL: [${graphqlSorted}]`);
    console.log(`   Draft:   [${draftSorted}]`);
    constantsMatch = false;
  }
}

if (constantsMatch) {
  console.log('✅ All ALLOWED_POSITIONS constants match perfectly!\\n');
} else {
  console.log('❌ ALLOWED_POSITIONS constants have differences!\\n');
}

// Test position checking logic
console.log('🧪 Testing position checking logic...\\n');

for (const testCase of testCases) {
  totalTests++;
  
  const graphqlResult = graphqlCanPlayerPlayPosition(testCase.playerPositions, testCase.requiredPosition);
  const draftResult = draftCanPlayerPlayPosition(testCase.playerPositions, testCase.requiredPosition);
  
  const passed = graphqlResult === draftResult;
  
  console.log(`${passed ? '✅' : '❌'} ${testCase.description}`);
  console.log(`   Player positions: [${testCase.playerPositions.join(', ')}]`);
  console.log(`   Required position: ${testCase.requiredPosition}`);
  console.log(`   GraphQL result: ${graphqlResult}`);
  console.log(`   Draft result: ${draftResult}`);
  
  if (!passed) {
    console.log(`   ❌ MISMATCH: Expected ${graphqlResult}, got ${draftResult}`);
  }
  
  console.log('');
  
  if (passed) passedTests++;
}

console.log(`\\n=== Test Results ===`);
console.log(`Logic Tests: ${passedTests}/${totalTests}`);
console.log(`Constants: ${constantsMatch ? 'MATCH' : 'DIFFERENT'}`);

if (passedTests === totalTests && constantsMatch) {
  console.log('🎉 All tests passed! Draft processor logic matches GraphQL API perfectly.');
} else {
  console.log('⚠️  Some tests failed. The draft processor and GraphQL API have different logic.');
}

export {};
