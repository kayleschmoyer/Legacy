#!/usr/bin/env tsx
import { E2EAuth, E2EJwtUtil } from './src/utils/jwt';

async function testJwtGeneration() {
  console.log('🧪 Testing JWT E2E Utilities...\n');

  try {
    // Test basic JWT generation
    console.log('1. Testing basic JWT generation...');
    const basicJwt = E2EAuth.generateUserJwt('5m');
    console.log(`   ✅ Generated user JWT: ${basicJwt.substring(0, 30)}...`);

    // Test admin JWT
    console.log('\n2. Testing admin JWT generation...');
    const adminJwt = E2EAuth.generateAdminJwt('5m');
    console.log(`   ✅ Generated admin JWT: ${adminJwt.substring(0, 30)}...`);

    // Test custom JWT
    console.log('\n3. Testing custom JWT generation...');
    const customJwt = E2EJwtUtil.generateJwt({
      email: 'custom@test.com',
      expiration: '10m',
      accessLevel: 'none',
    });
    console.log(`   ✅ Generated custom JWT: ${customJwt.substring(0, 30)}...`);

    // Test JWT validation
    console.log('\n4. Testing JWT validation...');
    const isValid = E2EJwtUtil.isValidJwtFormat(basicJwt);
    console.log(`   ✅ JWT format validation: ${isValid}`);

    // Test JWT decoding
    console.log('\n5. Testing JWT payload decoding...');
    const payload = E2EJwtUtil.decodeJwtPayload(basicJwt);
    console.log(`   ✅ Decoded payload:`, {
      email: payload.email,
      accessLevel: payload.accessLevel,
      exp: new Date(payload.exp * 1000).toISOString(),
    });

    // Test bulk generation
    console.log('\n6. Testing bulk JWT generation...');
    const testJwts = E2EJwtUtil.generateTestJwts('15m');
    console.log(`   ✅ Generated ${Object.keys(testJwts).length} test JWTs:`);
    Object.entries(testJwts).forEach(([type, jwt]) => {
      console.log(`      ${type}: ${jwt.substring(0, 20)}...`);
    });

    console.log('\n🎉 All JWT E2E utilities working correctly!');
    console.log('\n💡 Usage in tests:');
    console.log('   import { test } from "../fixtures/auth-enhanced";');
    console.log('   test("my test", async ({ page }) => {');
    console.log('     // JWT automatically set by fixture');
    console.log('     await page.goto("/dashboard");');
    console.log('   });');
  } catch (error) {
    console.error('\n❌ JWT generation test failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure CLI generate-jwt command is working');
    console.log("   2. Check that you're in the correct directory");
    console.log('   3. Verify Node.js and tsx are installed');
    process.exit(1);
  }
}

testJwtGeneration();
