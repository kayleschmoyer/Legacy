#!/usr/bin/env node
/**
 * Migration script to update all project configurations to use shared configs
 */

const fs = require('fs');
const path = require('path');

// Define shared config mappings
const eslintConfigs = {
  react: ['apps/app', 'apps/web', 'lib/shared-components'],
  lambda: [
    'lambdas/db',
    'lambdas/game-selection',
    'lambdas/oauth-proxy',
    'lambdas/stats-lambda',
  ],
  lib: [
    'lib/api',
    'lib/bref-client',
    'lib/data-loaders',
    'lib/db-client',
    'lib/env-utilities',
    'lib/logging',
    'lib/scoring',
    'lib/utils',
  ],
};

function updateEslintConfig(projectPath, configType) {
  const eslintPath = path.join(projectPath, '.eslintrc.json');
  if (!fs.existsSync(eslintPath)) return;

  const sharedConfig = `../../.eslintrc.${configType}.json`;
  const newConfig = {
    extends: [sharedConfig],
  };

  // Keep any existing special configurations
  try {
    const existing = JSON.parse(fs.readFileSync(eslintPath, 'utf8'));
    if (existing.parserOptions) {
      newConfig.parserOptions = existing.parserOptions;
    }
    if (
      existing.ignorePatterns &&
      existing.ignorePatterns.some((p) => p.includes('vite.config'))
    ) {
      newConfig.ignorePatterns = existing.ignorePatterns;
    }
    if (
      existing.overrides &&
      existing.overrides.some((o) => o.files && o.files.includes('*.json'))
    ) {
      newConfig.overrides = existing.overrides.filter(
        (o) => o.files && o.files.includes('*.json'),
      );
    }
  } catch (e) {
    console.warn(
      `Could not parse existing config for ${projectPath}:`,
      e.message,
    );
  }

  fs.writeFileSync(eslintPath, JSON.stringify(newConfig, null, 2) + '\n');
  console.log(`✅ Updated ESLint config for ${projectPath}`);
}

function updateViteConfig(projectPath, configType) {
  const viteFiles = ['vite.config.ts', 'vite.config.mts', 'vite.config.js'];

  for (const fileName of viteFiles) {
    const vitePath = path.join(projectPath, fileName);
    if (fs.existsSync(vitePath)) {
      const projectName = path.basename(projectPath);
      let content;

      switch (configType) {
        case 'lambda':
          content = `import { createLambdaConfig } from '../../tools/vite-configs';

export default createLambdaConfig('${projectName}');`;
          break;
        case 'lib':
          const hasReact = projectPath.includes('shared-components');
          content = `import { createLibConfig } from '../../tools/vite-configs';

export default createLibConfig('${projectName}', ${hasReact});`;
          break;
        case 'web':
          content = `import { createWebAppConfig } from '../../tools/vite-configs';

export default createWebAppConfig('${projectName}');`;
          break;
        default:
          continue;
      }

      // Only update if it's a simple config (not highly customized)
      const existing = fs.readFileSync(vitePath, 'utf8');
      if (existing.length < 2000 && !existing.includes('commonjsOptions')) {
        fs.writeFileSync(vitePath, content);
        console.log(`✅ Updated Vite config for ${projectPath}`);
      } else {
        console.log(`⚠️  Skipped complex Vite config for ${projectPath}`);
      }
      break;
    }
  }
}

// Apply migrations
console.log('🔧 Starting configuration migration...\n');

// Update ESLint configs
Object.entries(eslintConfigs).forEach(([configType, projects]) => {
  console.log(`📝 Updating ${configType} ESLint configs...`);
  projects.forEach((project) => {
    updateEslintConfig(project, configType);
  });
  console.log();
});

// Update Vite configs
console.log('📦 Updating Vite configs...');
eslintConfigs.lambda.forEach((project) => updateViteConfig(project, 'lambda'));
eslintConfigs.lib.forEach((project) => updateViteConfig(project, 'lib'));

console.log('\n✨ Migration complete!');
console.log('\n📋 Summary:');
console.log('- Created shared ESLint configurations');
console.log('- Created shared Vite configurations');
console.log('- Updated project configurations to use shared configs');
console.log('- Eliminated configuration duplication across the workspace');
