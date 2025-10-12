#!/usr/bin/env node

/**
 * Automatic workspace dependency alignment script
 * 
 * This script automatically updates all workspace package.json files to use "*"
 * for dependencies that are available in the root package.json.
 * 
 * Based on the Repository Improvements Plan - Critical Issue #1
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

function loadRootPackage() {
  const rootPath = path.join(__dirname, '..', 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
  
  // Combine all available dependencies from root
  const rootDeps = new Set([
    ...Object.keys(rootPackage.dependencies || {}),
    ...Object.keys(rootPackage.devDependencies || {})
  ]);
  
  console.log(`📦 Found ${rootDeps.size} dependencies in root package.json`);
  return rootDeps;
}

function findWorkspacePackages() {
  const pattern = '{apps,lib,lambdas}/**/package.json';
  const files = glob.sync(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/.nx/**']
  });
  
  console.log(`🔍 Found ${files.length} workspace package.json files`);
  return files;
}

function updatePackageDependencies(filePath, rootDeps) {
  const fullPath = path.resolve(filePath);
  const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  let changes = 0;
  
  // Update regular dependencies
  if (packageJson.dependencies) {
    for (const [depName, version] of Object.entries(packageJson.dependencies)) {
      if (rootDeps.has(depName) && version !== '*') {
        console.log(`  ✏️  Updating dependency "${depName}": ${version} → "*"`);
        packageJson.dependencies[depName] = '*';
        changes++;
      }
    }
  }
  
  // Update dev dependencies
  if (packageJson.devDependencies) {
    for (const [depName, version] of Object.entries(packageJson.devDependencies)) {
      if (rootDeps.has(depName) && version !== '*') {
        console.log(`  ✏️  Updating devDependency "${depName}": ${version} → "*"`);
        packageJson.devDependencies[depName] = '*';
        changes++;
      }
    }
  }
  
  if (changes > 0) {
    // Write back with proper formatting
    fs.writeFileSync(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`📝 Updated ${path.relative(process.cwd(), filePath)} (${changes} changes)`);
  }
  
  return changes;
}

function main() {
  console.log('🚀 Starting automatic workspace dependency alignment...\n');
  
  try {
    const rootDeps = loadRootPackage();
    const packageFiles = findWorkspacePackages();
    
    let totalChanges = 0;
    let filesChanged = 0;
    
    console.log('\n📋 Processing workspace packages:\n');
    
    for (const filePath of packageFiles) {
      const projectName = path.dirname(filePath);
      console.log(`📁 ${projectName}:`);
      
      const changes = updatePackageDependencies(filePath, rootDeps);
      if (changes > 0) {
        totalChanges += changes;
        filesChanged++;
      } else {
        console.log('  ✅ No changes needed');
      }
      console.log('');
    }
    
    console.log('✨ Dependency alignment completed!\n');
    console.log(`📊 Summary:`);
    console.log(`   Files processed: ${packageFiles.length}`);
    console.log(`   Files changed: ${filesChanged}`);
    console.log(`   Total dependency updates: ${totalChanges}`);
    
    if (totalChanges > 0) {
      console.log('\n🔧 Next steps:');
      console.log('   1. Run "npm install" to update dependencies');
      console.log('   2. Run "npm run validate:workspace-deps" to verify fixes');
      console.log('   3. Test build: "npm run build:libs"');
    }
    
  } catch (error) {
    console.error('❌ Error during dependency alignment:', error.message);
    process.exit(1);
  }
}

// Add --dry-run flag support
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No files will be modified\n');
  
  // Override fs.writeFileSync to prevent actual writes
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = (filePath, content) => {
    console.log(`  📋 Would write: ${path.relative(process.cwd(), filePath)}`);
  };
}

main();
