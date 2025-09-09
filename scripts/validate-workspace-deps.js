#!/usr/bin/env node

/**
 * NX Workspace Dependency Validation Script
 * 
 * This script ensures that all projects in the workspace are using dependencies 
 * from the root package.json rather than maintaining their own versions.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const rootPath = process.cwd();

console.log('🔍 Validating workspace dependency management...\n');

// Find all package.json files in workspace projects (exclude node_modules and root)
const globPattern = '**/package.json';
const packageJsonFiles = glob.sync(globPattern, {
  cwd: rootPath,
  ignore: ['node_modules/**', 'package.json', '**/dist/**', '**/.nx/**', '**/node_modules/**']
});

console.log(`Found ${packageJsonFiles.length} workspace package.json files to validate`);
console.log('Files:', packageJsonFiles.slice(0, 10), packageJsonFiles.length > 10 ? '...' : '');

// Get root package.json dependencies
const rootPackageJsonPath = path.join(rootPath, 'package.json');
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
const rootDeps = {
  ...rootPackageJson.dependencies || {},
  ...rootPackageJson.devDependencies || {}
};

let issueCount = 0;
let projectCount = 0;

for (const file of packageJsonFiles) {
  const fullPath = path.join(rootPath, file);
  projectCount++;
  const projectName = path.dirname(file);
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    
    // Check dependencies
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    
    let hasIssues = false;
    
    for (const [dep, version] of Object.entries(dependencies)) {
      if (rootDeps[dep] && version !== '*') {
        if (!hasIssues) {
          console.log(`\n📁 ${projectName}:`);
          hasIssues = true;
        }
        console.log(`  ⚠️  Dependency "${dep}" should use "*" but has "${version}"`);
        issueCount++;
      }
    }
    
    for (const [dep, version] of Object.entries(devDependencies)) {
      if (rootDeps[dep] && version !== '*') {
        if (!hasIssues) {
          console.log(`\n📁 ${projectName}:`);
          hasIssues = true;
        }
        console.log(`  ⚠️  DevDependency "${dep}" should use "*" but has "${version}"`);
        issueCount++;
      }
    }
    
  } catch (error) {
    console.log(`❌ Error reading ${file}: ${error.message}`);
  }
}

console.log('\n🔧 Recommendations:');
console.log('1. Move shared dependencies to root package.json');
console.log('2. Use "*" for dependencies available in root');
console.log('3. Keep project-specific dependencies with exact versions');
console.log('4. Run "npm install" after making changes');

console.log('\n📋 Summary:');
console.log(`   Workspace projects validated: ${projectCount}`);
console.log(`   Issues found: ${issueCount}`);
console.log(`   Root dependencies: ${Object.keys(rootDeps).length}`);

if (issueCount > 0) {
  console.log('\n❌ Workspace dependency validation failed');
  process.exit(1);
} else {
  console.log('\n✅ All workspace dependencies are properly configured');
  process.exit(0);
}
