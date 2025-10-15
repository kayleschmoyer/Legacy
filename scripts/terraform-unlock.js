#!/usr/bin/env node
/**
 * Terraform State Lock Management Script
 * 
 * Helps manage and release stuck Terraform state locks.
 * Can be run locally or in CI/CD pipelines.
 * 
 * Usage:
 *   node scripts/terraform-unlock.js                    # Check for locks
 *   node scripts/terraform-unlock.js <lock-id>          # Unlock specific lock
 *   node scripts/terraform-unlock.js --latest           # Unlock most recent lock
 */

const { execSync } = require('child_process');
const path = require('path');

const TERRAFORM_DIR = path.join(__dirname, '..', 'terraform');

function exec(command, options = {}) {
  try {
    return execSync(command, {
      cwd: TERRAFORM_DIR,
      encoding: 'utf8',
      ...options,
    });
  } catch (error) {
    return error.stdout || error.stderr || error.message;
  }
}

function getCurrentLockInfo() {
  console.log('🔍 Checking Terraform state lock status...\n');
  
  const output = exec('terraform plan -lock=false -refresh=false', { 
    stdio: 'pipe' 
  });
  
  if (output.includes('Error acquiring the state lock') || output.includes('Lock Info:')) {
    // Parse lock information
    const lockIdMatch = output.match(/ID:\s+([a-f0-9-]+)/);
    const whoMatch = output.match(/Who:\s+(.+)/);
    const createdMatch = output.match(/Created:\s+(.+)/);
    
    if (lockIdMatch) {
      return {
        locked: true,
        lockId: lockIdMatch[1],
        who: whoMatch ? whoMatch[1].trim() : 'Unknown',
        created: createdMatch ? createdMatch[1].trim() : 'Unknown',
      };
    }
  }
  
  return { locked: false };
}

function unlockState(lockId) {
  console.log(`🔓 Attempting to force-unlock Terraform state...`);
  console.log(`   Lock ID: ${lockId}\n`);
  
  try {
    const output = exec(`terraform force-unlock -force ${lockId}`, {
      stdio: 'inherit',
    });
    
    console.log('\n✅ Terraform state successfully unlocked!');
    console.log('   You can now run Terraform commands.');
    return true;
  } catch (error) {
    console.error('\n❌ Failed to unlock Terraform state');
    console.error('   Error:', error.message);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Terraform State Lock Management                   ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  
  // Check if terraform directory exists
  const fs = require('fs');
  if (!fs.existsSync(TERRAFORM_DIR)) {
    console.error('❌ Terraform directory not found:', TERRAFORM_DIR);
    process.exit(1);
  }
  
  // Get current lock status
  const lockInfo = getCurrentLockInfo();
  
  if (!lockInfo.locked) {
    console.log('✅ Terraform state is NOT locked');
    console.log('   No action needed - state is available.\n');
    process.exit(0);
  }
  
  // State is locked
  console.log('⚠️  Terraform state IS LOCKED\n');
  console.log('Lock Information:');
  console.log(`  • Lock ID: ${lockInfo.lockId}`);
  console.log(`  • Held by:  ${lockInfo.who}`);
  console.log(`  • Created:  ${lockInfo.created}\n`);
  
  // Determine what to do
  if (args.length === 0 || args[0] === '--check') {
    console.log('💡 To unlock, run one of:');
    console.log(`   node scripts/terraform-unlock.js ${lockInfo.lockId}`);
    console.log(`   node scripts/terraform-unlock.js --latest`);
    console.log(`   cd terraform && terraform force-unlock ${lockInfo.lockId}\n`);
    process.exit(1);
  }
  
  // Get lock ID to unlock
  let lockIdToUnlock;
  if (args[0] === '--latest') {
    lockIdToUnlock = lockInfo.lockId;
    console.log('🎯 Unlocking most recent lock...\n');
  } else {
    lockIdToUnlock = args[0];
    
    // Verify it matches current lock
    if (lockIdToUnlock !== lockInfo.lockId) {
      console.log('⚠️  Warning: Provided lock ID does not match current lock');
      console.log(`   Provided: ${lockIdToUnlock}`);
      console.log(`   Current:  ${lockInfo.lockId}`);
      console.log('\n   The lock may have changed. Proceeding anyway...\n');
    }
  }
  
  // Attempt unlock
  const success = unlockState(lockIdToUnlock);
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { getCurrentLockInfo, unlockState };
