#!/usr/bin/env node

/**
 * Project Tagging System Implementation
 * 
 * This script automatically adds meaningful tags to all project.json files
 * based on the repository improvements plan tagging strategy.
 * 
 * Based on Repository Improvements Plan - Medium Priority Issue #5
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Tagging strategy mapping
const PROJECT_TAGS = {
  // Applications
  'web': ['scope:app', 'platform:web', 'type:frontend'],
  'app': ['scope:app', 'platform:mobile', 'type:frontend'], 
  'cli': ['scope:app', 'platform:node', 'type:cli'],
  'graphql-explorer': ['scope:app', 'platform:web', 'type:dev-tool'],
  
  // E2E Test Applications
  'web-e2e': ['scope:e2e', 'platform:web', 'type:test'],
  'app-e2e': ['scope:e2e', 'platform:mobile', 'type:test'],
  'cli-e2e': ['scope:e2e', 'platform:node', 'type:test'],

  // Libraries - Core
  'utils': ['scope:lib', 'type:util', 'platform:shared'],
  'env-utilities': ['scope:lib', 'type:config', 'platform:shared'],
  'logging': ['scope:lib', 'type:util', 'platform:shared'],
  
  // Libraries - Platform
  'tamagui-config': ['scope:lib', 'type:config', 'platform:shared'],
  'ui-abstractions': ['scope:lib', 'type:ui', 'platform:shared'],
  'shared-components': ['scope:lib', 'type:ui', 'platform:shared'],
  
  // Libraries - Data
  'db-client': ['scope:lib', 'type:data', 'platform:shared'],
  'aws-utils': ['scope:lib', 'type:util', 'platform:node'],
  'bref-client': ['scope:lib', 'type:util', 'platform:node'],
  'sentry': ['scope:lib', 'type:util', 'platform:shared'],
  
  // Libraries - Business Logic
  'api': ['scope:lib', 'type:api', 'platform:shared'],
  'data-loaders': ['scope:lib', 'type:data', 'platform:shared'],
  'scoring': ['scope:lib', 'type:business', 'platform:shared'],
  
  // Lambda Functions
  'db': ['scope:lambda', 'type:api', 'platform:node'],
  'oauth-proxy': ['scope:lambda', 'type:auth', 'platform:node'],
  'draft-processor': ['scope:lambda', 'type:worker', 'platform:node'],
  'game-selection': ['scope:lambda', 'type:api', 'platform:node'],
  'stats-lambda': ['scope:lambda', 'type:api', 'platform:node'],
  
  // Lambda Layers
  'node-pg': ['scope:lambda', 'type:layer', 'platform:node']
};

function findAllProjectFiles() {
  const pattern = '**/project.json';
  const files = glob.sync(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**']
  });
  
  console.log(`🔍 Found ${files.length} project.json files`);
  return files;
}

function getProjectNameFromPath(projectPath) {
  const projectDir = path.dirname(projectPath);
  const parts = projectDir.split(path.sep);
  return parts[parts.length - 1];
}

function updateProjectTags(filePath) {
  const projectName = getProjectNameFromPath(filePath);
  const projectJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Get the recommended tags for this project
  const recommendedTags = PROJECT_TAGS[projectName];
  
  if (!recommendedTags) {
    console.log(`⚠️  ${projectName}: No tag mapping found, skipping...`);
    return false;
  }
  
  // Get existing tags
  const existingTags = projectJson.tags || [];
  
  // Merge recommended tags with any existing ones
  const allTags = [...new Set([...existingTags, ...recommendedTags])];
  
  // Sort tags for consistency
  allTags.sort();
  
  // Update the project
  projectJson.tags = allTags;
  
  // Write back to file with proper formatting
  fs.writeFileSync(filePath, JSON.stringify(projectJson, null, 2) + '\n');
  
  console.log(`✅ ${projectName}: Added tags [${allTags.join(', ')}]`);
  return true;
}

function generateTagSummary() {
  const tagCounts = {};
  const projectsByScope = {};
  const projectsByType = {};
  const projectsByPlatform = {};
  
  Object.entries(PROJECT_TAGS).forEach(([project, tags]) => {
    tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      
      const [category, value] = tag.split(':');
      if (category === 'scope') {
        if (!projectsByScope[value]) projectsByScope[value] = [];
        projectsByScope[value].push(project);
      } else if (category === 'type') {
        if (!projectsByType[value]) projectsByType[value] = [];
        projectsByType[value].push(project);
      } else if (category === 'platform') {
        if (!projectsByPlatform[value]) projectsByPlatform[value] = [];
        projectsByPlatform[value].push(project);
      }
    });
  });
  
  console.log('\n📊 Tagging Strategy Summary:\n');
  
  console.log('📁 By Scope:');
  Object.entries(projectsByScope).forEach(([scope, projects]) => {
    console.log(`   ${scope}: ${projects.length} projects (${projects.join(', ')})`);
  });
  
  console.log('\n🏷️  By Type:');
  Object.entries(projectsByType).forEach(([type, projects]) => {
    console.log(`   ${type}: ${projects.length} projects (${projects.join(', ')})`);
  });
  
  console.log('\n🖥️  By Platform:');
  Object.entries(projectsByPlatform).forEach(([platform, projects]) => {
    console.log(`   ${platform}: ${projects.length} projects (${projects.join(', ')})`);
  });
  
  console.log('\n🎯 Example Nx Commands:');
  console.log('   # Build all libraries:');
  console.log('   npx nx run-many --target=build --projects=tag:scope:lib');
  console.log('   ');
  console.log('   # Test all applications:');
  console.log('   npx nx run-many --target=test --projects=tag:scope:app');
  console.log('   ');
  console.log('   # Lint all shared platform code:');
  console.log('   npx nx run-many --target=lint --projects=tag:platform:shared');
  console.log('   ');
  console.log('   # Build all API-related projects:');
  console.log('   npx nx run-many --target=build --projects=tag:type:api');
}

function main() {
  console.log('🚀 Starting project tagging system implementation...\n');
  
  try {
    const projectFiles = findAllProjectFiles();
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    console.log('\n📋 Updating project tags:\n');
    
    for (const filePath of projectFiles) {
      if (updateProjectTags(filePath)) {
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log('\n✨ Project tagging completed!\n');
    console.log(`📊 Summary:`);
    console.log(`   Projects updated: ${updatedCount}`);
    console.log(`   Projects skipped: ${skippedCount}`);
    console.log(`   Total processed: ${projectFiles.length}`);
    
    generateTagSummary();
    
    console.log('\n🔧 Next steps:');
    console.log('   1. Test tag-based commands: "npx nx run-many --target=build --projects=tag:scope:lib"');
    console.log('   2. Update build scripts to use new tags');
    console.log('   3. Consider adding more specific tags for complex projects');
    
  } catch (error) {
    console.error('❌ Error during project tagging:', error.message);
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
    console.log(`  📋 Would update: ${path.relative(process.cwd(), filePath)}`);
  };
}

main();
