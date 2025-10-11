/**
 * Test Results Parser
 * 
 * Simple utility to parse and display Playwright JSON test results
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'unexpected';
  duration: number;
  error?: {
    message: string;
    location: {
      file: string;
      line: number;
      column: number;
    };
  };
}

interface TestSuite {
  title: string;
  tests: TestResult[];
  stats: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
  };
}

function parseTestResults(jsonPath = './test-results/results.json'): TestSuite[] {
  try {
    const resultsJson = readFileSync(jsonPath, 'utf8');
    const results = JSON.parse(resultsJson);
    
    const suites: TestSuite[] = [];
    
    // Extract tests from the Playwright JSON format
    const suiteMap = new Map<string, TestResult[]>();
    
    // Recursive function to process nested suites and specs
    function processSuite(suite: any, parentName = ''): void {
      const suiteName = suite.title || 'Unnamed Suite';
      const fullSuiteName = parentName ? `${parentName} › ${suiteName}` : suiteName;
      
      if (!suiteMap.has(fullSuiteName)) {
        suiteMap.set(fullSuiteName, []);
      }
      
      // Process specs within this suite
      for (const spec of suite.specs || []) {
        const testTitle = spec.title || 'Unnamed Test';
        
        // Get the test results from the spec
        for (const test of spec.tests || []) {
          const testResult: TestResult = {
            title: testTitle,
            status: test.results[0]?.status || 'skipped',
            duration: test.results[0]?.duration || 0,
          };
          
          if (test.results[0]?.error) {
            testResult.error = {
              message: test.results[0].error.message,
              location: test.results[0].error.location,
            };
          }
          
          suiteMap.get(fullSuiteName).push(testResult);
        }
      }
      
      // Recursively process nested suites
      for (const nestedSuite of suite.suites || []) {
        processSuite(nestedSuite, fullSuiteName);
      }
    }
    
    // Playwright JSON format has suites array with nested structure
    for (const suite of results.suites || []) {
      processSuite(suite);
    }
    
    // Convert map to array with stats
    for (const [suiteName, tests] of suiteMap.entries()) {
      const stats = {
        passed: tests.filter(t => t.status === 'passed').length,
        failed: tests.filter(t => t.status === 'failed' || t.status === 'unexpected').length,
        skipped: tests.filter(t => t.status === 'skipped').length,
        total: tests.length,
        duration: tests.reduce((sum, t) => sum + t.duration, 0),
      };
      
      suites.push({
        title: suiteName,
        tests,
        stats,
      });
    }
    
    return suites;
  } catch (error) {
    console.error('Failed to parse test results:', error);
    return [];
  }
}

function displayResults(suites: TestSuite[]) {
  console.log('\n📊 Test Results Summary');
  console.log('========================\n');
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuration = 0;
  
  for (const suite of suites) {
    console.log(`📁 ${suite.title}`);
    console.log(`   ✅ ${suite.stats.passed} passed`);
    console.log(`   ❌ ${suite.stats.failed} failed`);
    console.log(`   ⏭️  ${suite.stats.skipped} skipped`);
    console.log(`   ⏱️  ${suite.stats.duration}ms total\n`);
    
    // Show failed tests with details
    for (const test of suite.tests) {
      if (test.status === 'failed' || test.status === 'unexpected') {
        console.log(`   ❌ ${test.title}`);
        if (test.error) {
          console.log(`      Error: ${test.error.message.split('\n')[0]}`);
          console.log(`      Location: ${test.error.location.file}:${test.error.location.line}\n`);
        }
      }
    }
    
    totalPassed += suite.stats.passed;
    totalFailed += suite.stats.failed;
    totalSkipped += suite.stats.skipped;
    totalDuration += suite.stats.duration;
  }
  
  console.log('📊 Overall Summary');
  console.log('==================');
  console.log(`✅ ${totalPassed} passed`);
  console.log(`❌ ${totalFailed} failed`);
  console.log(`⏭️ ${totalSkipped} skipped`);
  console.log(`⏱️ ${totalDuration}ms total duration`);
  console.log(`📈 Success Rate: ${totalPassed + totalFailed > 0 ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0}%\n`);
}

// If run directly, parse and display results
if (require.main === module) {
  const suites = parseTestResults();
  displayResults(suites);
}

export { parseTestResults, displayResults, TestResult, TestSuite };
