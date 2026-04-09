#!/usr/bin/env node
// Validate all agent skills under .agents/skills/ using the official agentskills validator.
// Requires: uvx (from uv) and the skills-ref package on PyPI.
// Run via: make lint-skills  OR  node scripts/lint-skills.js

const { execFileSync } = require('child_process');
const { readdirSync, statSync, existsSync, readFileSync } = require('fs');
const { join, resolve } = require('path');

const root = resolve(__dirname, '..');
const skillsDir = join(root, '.agents', 'skills');

// Skip third-party skills managed via skills-lock.json — they may use
// frontmatter fields not in the agentskills spec (e.g. user-invocable, argument-hint).
const lockPath = join(root, 'skills-lock.json');
let thirdPartySkills = new Set();
if (existsSync(lockPath)) {
  try {
    thirdPartySkills = new Set(
      Object.keys(JSON.parse(readFileSync(lockPath, 'utf8')).skills ?? {}),
    );
  } catch (e) {
    console.error(`Warning: could not parse skills-lock.json: ${e.message}`);
  }
}

const dirs = readdirSync(skillsDir).filter(
  (name) =>
    statSync(join(skillsDir, name)).isDirectory() &&
    !thirdPartySkills.has(name),
);

let passed = 0;
let failed = 0;
const failures = [];

for (const name of dirs) {
  const skillPath = join(skillsDir, name);
  try {
    execFileSync(
      'uvx',
      ['--from', 'skills-ref', 'agentskills', 'validate', skillPath],
      { stdio: 'pipe' },
    );
    passed++;
  } catch (err) {
    failed++;
    const msg = (err.stderr ?? err.stdout ?? err.message ?? '')
      .toString()
      .trim();
    failures.push({ name, msg });
  }
}

if (failures.length > 0) {
  for (const { name, msg } of failures) {
    console.error(`\n✖ ${name}`);
    console.error(`  ${msg.replace(/\n/g, '\n  ')}`);
  }
  console.error(`\n${failed} skill(s) failed validation, ${passed} passed.`);
  process.exit(1);
} else {
  console.log(`✔ All ${passed} skills are valid.`);
}
