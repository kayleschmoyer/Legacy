/**
 * Validation script for shared configurations
 * Checks which projects are using shared configs and which still need migration
 */

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

const WORKSPACE_ROOT = path.resolve(__dirname, '../..');

function checkEslintConfigs() {
  console.log('\n🔍 Checking ESLint configurations...\n');

  const eslintConfigs = globSync('**/.eslintrc.json', {
    cwd: WORKSPACE_ROOT,
    ignore: ['node_modules/**', 'dist/**', 'tmp/**'],
  });

  let sharedConfigs = 0;
  let individualConfigs = 0;

  eslintConfigs.forEach((configPath) => {
    const fullPath = path.join(WORKSPACE_ROOT, configPath);
    const config = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

    if (
      config.extends &&
      Array.isArray(config.extends) &&
      config.extends.some((ext) => ext.includes('.eslintrc.'))
    ) {
      console.log(`✅ ${configPath} - Using shared config`);
      sharedConfigs++;
    } else {
      console.log(
        `❌ ${configPath} - Individual config (${
          JSON.stringify(config).length
        } chars)`
      );
      individualConfigs++;
    }
  });

  console.log(
    `\n📊 ESLint Summary: ${sharedConfigs} shared, ${individualConfigs} individual`
  );
  return { shared: sharedConfigs, individual: individualConfigs };
}

function checkViteConfigs() {
  console.log('\n🔍 Checking Vite configurations...\n');

  const viteConfigs = globSync('**/vite.config.{ts,mts,js}', {
    cwd: WORKSPACE_ROOT,
    ignore: ['node_modules/**', 'dist/**', 'tmp/**'],
  });

  let sharedConfigs = 0;
  let individualConfigs = 0;

  viteConfigs.forEach((configPath) => {
    const fullPath = path.join(WORKSPACE_ROOT, configPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    if (
      content.includes('tools/vite-configs') ||
      content.includes('createLambdaConfig') ||
      content.includes('createLibConfig') ||
      content.includes('createWebAppConfig')
    ) {
      console.log(`✅ ${configPath} - Using shared config`);
      sharedConfigs++;
    } else {
      console.log(
        `❌ ${configPath} - Individual config (${content.length} chars)`
      );
      individualConfigs++;
    }
  });

  console.log(
    `\n📊 Vite Summary: ${sharedConfigs} shared, ${individualConfigs} individual`
  );
  return { shared: sharedConfigs, individual: individualConfigs };
}

function generateMigrationCommands() {
  console.log('\n🚀 Migration Commands:\n');
  console.log('To apply shared ESLint configs to remaining projects:');
  console.log('node tools/scripts/migrate-configs.js eslint\n');

  console.log('To apply shared Vite configs to remaining projects:');
  console.log('node tools/scripts/migrate-configs.js vite\n');

  console.log('To apply both:');
  console.log('node tools/scripts/migrate-configs.js all\n');
}

function main() {
  console.log('🔧 Shared Configuration Validation Report');
  console.log('==========================================');

  const eslintStats = checkEslintConfigs();
  const viteStats = checkViteConfigs();

  const totalProjects = eslintStats.shared + eslintStats.individual;
  const eslintProgress = Math.round((eslintStats.shared / totalProjects) * 100);

  const totalViteProjects = viteStats.shared + viteStats.individual;
  const viteProgress =
    totalViteProjects > 0
      ? Math.round((viteStats.shared / totalViteProjects) * 100)
      : 100;

  console.log('\n📈 Overall Progress:');
  console.log(
    `ESLint: ${eslintProgress}% migrated (${eslintStats.shared}/${totalProjects})`
  );
  console.log(
    `Vite: ${viteProgress}% migrated (${viteStats.shared}/${totalViteProjects})`
  );

  if (eslintProgress < 100 || viteProgress < 100) {
    generateMigrationCommands();
  } else {
    console.log('\n🎉 All configurations are using shared configs!');
  }
}

main();
