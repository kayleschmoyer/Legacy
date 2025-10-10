#!/usr/bin/env node

/**
 * Migration script to help update existing E2E tests to use CLI-generated JWTs
 * 
 * Usage: node migrate-to-cli-jwt.js
 * 
 * This script will:
 * 1. Scan existing test files
 * 2. Identify hardcoded JWT tokens
 * 3. Suggest replacements with CLI-generated JWTs
 * 4. Optionally update imports to use new auth fixtures
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, '../tests');
const FIXTURE_DIR = path.join(__dirname, '../fixtures');

// Pattern to match hardcoded JWTs
const JWT_PATTERN = /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g;

// Pattern to match localStorage.setItem with JWT
const LOCALSTORAGE_PATTERN = /localStorage\.setItem\(['"`]auth_jwt['"`],\s*['"`]([^'"`]+)['"`]\)/g;

function scanTestFiles() {
  console.log('🔍 Scanning E2E test files for JWT usage...\n');
  
  if (!fs.existsSync(TEST_DIR)) {
    console.error(`❌ Test directory not found: ${TEST_DIR}`);
    return;
  }

  const testFiles = fs.readdirSync(TEST_DIR).filter(file => 
    file.endsWith('.spec.ts') || file.endsWith('.test.ts')
  );

  let totalFiles = 0;
  let filesWithJWT = 0;
  const suggestions = [];

  testFiles.forEach(filename => {
    const filePath = path.join(TEST_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    totalFiles++;

    // Look for hardcoded JWTs
    const jwtMatches = content.match(JWT_PATTERN);
    const localStorageMatches = content.match(LOCALSTORAGE_PATTERN);

    if (jwtMatches || localStorageMatches) {
      filesWithJWT++;
      console.log(`📄 ${filename}:`);
      
      if (jwtMatches) {
        console.log(`   🔑 Found ${jwtMatches.length} hardcoded JWT(s)`);
        jwtMatches.forEach((jwt, index) => {
          console.log(`      ${index + 1}. ${jwt.substring(0, 30)}...`);
        });
      }

      if (localStorageMatches) {
        console.log(`   💾 Found ${localStorageMatches.length} localStorage JWT assignments`);
      }

      // Generate migration suggestions
      suggestions.push({
        file: filename,
        path: filePath,
        jwtCount: jwtMatches?.length || 0,
        storageCount: localStorageMatches?.length || 0,
        content: content
      });
      
      console.log('');
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   Total test files: ${totalFiles}`);
  console.log(`   Files with hardcoded JWTs: ${filesWithJWT}`);
  
  if (suggestions.length > 0) {
    console.log('\n💡 Migration suggestions:\n');
    generateMigrationSuggestions(suggestions);
  } else {
    console.log('\n✅ No hardcoded JWTs found - you\'re all set!');
  }
}

function generateMigrationSuggestions(suggestions) {
  suggestions.forEach(({ file, path: filePath, jwtCount, storageCount, content }) => {
    console.log(`📝 ${file}:`);
    
    // Check current imports
    const hasOldAuthImport = content.includes("from '../fixtures/auth'");
    const hasNewAuthImport = content.includes("from '../fixtures/auth-enhanced'");
    
    if (!hasNewAuthImport) {
      console.log('   1. Update imports:');
      if (hasOldAuthImport) {
        console.log('      Replace: import { test } from \'../fixtures/auth\';');
        console.log('      With:    import { test } from \'../fixtures/auth-enhanced\';');
      } else {
        console.log('      Add: import { test, expect } from \'../fixtures/auth-enhanced\';');
      }
    }

    // Suggest removing hardcoded JWTs
    if (jwtCount > 0) {
      console.log('   2. Remove hardcoded JWTs:');
      console.log('      The new auth fixture automatically generates fresh JWTs');
      console.log('      You can remove the hardcoded JWT strings');
    }

    if (storageCount > 0) {
      console.log('   3. Simplify localStorage setup:');
      console.log('      Replace manual localStorage.setItem calls with fixture usage');
      console.log('      The auth fixture handles JWT setup automatically');
    }

    // Provide specific code examples
    console.log('   📋 Example migration:');
    console.log('      BEFORE:');
    console.log('        test("my test", async ({ page }) => {');
    console.log('          await page.addInitScript(() => {');
    console.log('            localStorage.setItem("auth_jwt", "hardcoded-jwt-here");');
    console.log('          });');
    console.log('          // ... test logic');
    console.log('        });');
    console.log('');
    console.log('      AFTER:');
    console.log('        test("my test", async ({ page }) => {');
    console.log('          // JWT is automatically set by the fixture');
    console.log('          // ... test logic (no setup needed)');
    console.log('        });');
    console.log('');

    // Advanced patterns
    if (content.includes('admin') || content.includes('Admin')) {
      console.log('   🎯 For admin tests, use:');
      console.log('      import { adminTest } from \'../fixtures/auth-enhanced\';');
      console.log('      adminTest("admin test", async ({ page }) => { ... });');
      console.log('');
    }
  });
}

function checkFixtureSetup() {
  console.log('\n🔧 Checking fixture setup...');
  
  const enhancedFixturePath = path.join(FIXTURE_DIR, 'auth-enhanced.ts');
  const utilsPath = path.join(__dirname, '../utils/jwt.ts');
  
  if (fs.existsSync(enhancedFixturePath)) {
    console.log('✅ Enhanced auth fixture is available');
  } else {
    console.log('❌ Enhanced auth fixture not found');
    console.log('   Run: Create the auth-enhanced.ts fixture file');
  }
  
  if (fs.existsSync(utilsPath)) {
    console.log('✅ JWT utilities are available');
  } else {
    console.log('❌ JWT utilities not found');
    console.log('   Run: Create the utils/jwt.ts file');
  }
}

function generateMigrationTemplate() {
  const templatePath = path.join(__dirname, '../MIGRATION_TEMPLATE.md');
  
  const template = `# E2E JWT Migration Checklist

## Files to Update

### 1. Test Files with Hardcoded JWTs
- [ ] Replace hardcoded JWT strings with fixture usage
- [ ] Update imports to use \`auth-enhanced\` fixture
- [ ] Remove manual \`localStorage.setItem\` calls
- [ ] Test that authentication still works

### 2. Import Updates
\`\`\`typescript
// OLD
import { test } from '../fixtures/auth';

// NEW  
import { test, adminTest } from '../fixtures/auth-enhanced';
\`\`\`

### 3. Authentication Patterns

#### Regular User Test (Auto JWT)
\`\`\`typescript
test('regular user test', async ({ page }) => {
  // JWT automatically set for user@test.com
  await page.goto('/dashboard');
  // ... test logic
});
\`\`\`

#### Admin Test
\`\`\`typescript
adminTest('admin test', async ({ page }) => {
  // JWT automatically set for admin@test.com with admin access
  await page.goto('/admin');
  // ... test logic
});
\`\`\`

#### Custom User
\`\`\`typescript
import { createCustomAuthTest } from '../fixtures/auth-enhanced';
const customTest = createCustomAuthTest('manager@test.com', 'none');

customTest('custom user test', async ({ page }) => {
  // JWT set for manager@test.com
  // ... test logic
});
\`\`\`

## Verification Steps
1. Run tests to ensure they still pass
2. Check browser localStorage has valid JWT
3. Verify authentication behavior is unchanged
4. Test both success and failure scenarios

## Rollback Plan
If issues arise, you can:
1. Revert to original auth fixture temporarily
2. Use fallback mock JWTs (built into enhanced fixture)
3. Generate JWTs manually with CLI command
`;

  fs.writeFileSync(templatePath, template);
  console.log(`📋 Migration template created: ${templatePath}`);
}

// Main execution
console.log('🚀 E2E JWT Migration Helper\n');

checkFixtureSetup();
scanTestFiles();
generateMigrationTemplate();

console.log('\n🎯 Next Steps:');
console.log('1. Review the migration suggestions above');
console.log('2. Update test files to use the new auth fixtures');
console.log('3. Test your E2E suite to verify everything works');
console.log('4. Remove old hardcoded JWTs once migration is complete');
console.log('\n📖 See JWT_E2E_TESTING_GUIDE.md for detailed usage examples');
