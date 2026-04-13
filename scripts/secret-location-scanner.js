#!/usr/bin/env node
// Secret location scanner: checks 11 canonical locations for a given secret/env var
// and reports which ones are present vs missing.
//
// Usage:
//   node scripts/secret-location-scanner.js DATABASE_URL
//   node scripts/secret-location-scanner.js --json MY_SECRET
//
// Exit codes: 0 = present in all checked locations, 1 = absent from one or more

const { existsSync, readFileSync, readdirSync } = require('fs');
const { resolve, join } = require('path');
const { execFileSync } = require('child_process');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const rawVarName = args.find((a) => !a.startsWith('--'));
const varName = rawVarName;
// Escape regex metacharacters in variable name for safe use in RegExp
const escapedVarName = rawVarName
  ? rawVarName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  : '';

if (!varName) {
  console.error(
    'Usage: node scripts/secret-location-scanner.js <VARIABLE_NAME>',
  );
  process.exit(2);
}

const results = [];

function check(name, fn) {
  try {
    const found = fn();
    results.push({
      location: name,
      found,
      detail: found ? 'present' : 'missing',
    });
  } catch (e) {
    results.push({
      location: name,
      found: false,
      detail: `error: ${e.message}`,
    });
  }
}

// 1. Root .env
check('.env (root)', () => {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return false;
  const content = readFileSync(envPath, 'utf8');
  return new RegExp(`^${escapedVarName}\\s*=`, 'm').test(content);
});

// 2. .env.local
check('.env.local', () => {
  const envPath = join(root, '.env.local');
  if (!existsSync(envPath)) return false;
  const content = readFileSync(envPath, 'utf8');
  return new RegExp(`^${escapedVarName}\\s*=`, 'm').test(content);
});

// 3. Terraform variables
check('terraform/variables.tf', () => {
  const tfPath = join(root, 'terraform');
  if (!existsSync(tfPath)) return false;
  const files = readdirSync(tfPath).filter((f) => f.endsWith('.tf'));
  for (const f of files) {
    const content = readFileSync(join(tfPath, f), 'utf8');
    const snakeCase = varName.toLowerCase();
    if (
      content.includes(`"${varName}"`) ||
      content.includes(`"${snakeCase}"`)
    ) {
      return true;
    }
  }
  return false;
});

// 4. GitHub Actions secrets
check('.github/workflows/*.yml', () => {
  const ghPath = join(root, '.github', 'workflows');
  if (!existsSync(ghPath)) return false;
  const files = readdirSync(ghPath).filter(
    (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
  );
  for (const f of files) {
    const content = readFileSync(join(ghPath, f), 'utf8');
    if (
      content.includes(`secrets.${varName}`) ||
      content.includes(`\${{ secrets.${varName} }}`)
    ) {
      return true;
    }
  }
  return false;
});

// 5. Lambda environment config (Terraform)
check('terraform/lambda env blocks', () => {
  const tfPath = join(root, 'terraform');
  if (!existsSync(tfPath)) return false;
  const files = readdirSync(tfPath).filter((f) => f.endsWith('.tf'));
  for (const f of files) {
    const content = readFileSync(join(tfPath, f), 'utf8');
    // Look for env var in lambda environment blocks
    if (content.includes(`${varName}`) && content.includes('environment')) {
      return true;
    }
  }
  return false;
});

// 6. Docker compose
check('docker-compose.yml', () => {
  const dcPath = join(root, 'docker-compose.yml');
  if (!existsSync(dcPath)) return false;
  const content = readFileSync(dcPath, 'utf8');
  return content.includes(varName);
});

// 7. app.json (Expo)
check('app.json (Expo)', () => {
  const appPath = join(root, 'app.json');
  if (!existsSync(appPath)) return false;
  const content = readFileSync(appPath, 'utf8');
  return content.includes(varName);
});

// 8. .env.example or .env.template
check('.env.example', () => {
  for (const name of ['.env.example', '.env.template', '.env.sample']) {
    const envPath = join(root, name);
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      if (new RegExp(`^${escapedVarName}\\s*=`, 'm').test(content)) return true;
    }
  }
  return false;
});

// 9. scripts/validate-secrets.js (if it checks this var)
check('scripts/validate-secrets.js', () => {
  const scriptPath = join(root, 'scripts', 'validate-secrets.js');
  if (!existsSync(scriptPath)) return false;
  const content = readFileSync(scriptPath, 'utf8');
  return content.includes(varName);
});

// 10. Nx project.json files (env vars in target options)
check('project.json files', () => {
  try {
    const output = execFileSync(
      'git',
      ['grep', '-l', '-F', '-e', varName, '--', '**/project.json'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
});

// 11. AGENTS.md / skill docs (documentation references)
check('Agent docs (.agents/)', () => {
  try {
    const output = execFileSync(
      'git',
      ['grep', '-rl', '-F', '-e', varName, '--', '.agents/'],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    return output.trim().length > 0;
  } catch {
    return false;
  }
});

// --- Output ---
const found = results.filter((r) => r.found);
const missing = results.filter((r) => !r.found);

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        variable: varName,
        totalLocations: results.length,
        found: found.length,
        missing: missing.length,
        results,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`🔍 Scanning for: ${varName}\n`);
  for (const r of results) {
    const icon = r.found ? '✅' : '❌';
    console.log(`${icon} ${r.location}`);
  }
  console.log(`\n📊 Found in ${found.length}/${results.length} locations`);
  if (missing.length > 0) {
    console.log(`\n⚠️  Missing from:`);
    for (const r of missing) {
      console.log(`   - ${r.location}`);
    }
  }
}

process.exit(missing.length > 0 ? 1 : 0);
