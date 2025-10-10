#!/usr/bin/env tsx
/**
 * CLI-based Draft Status Update Test
 * 
 * This test uses CLI commands and direct GraphQL queries to verify that
 * starting a draft correctly updates the league draft status.
 * 
 * Can be run independently without needing a full E2E test environment.
 */

import { execSync } from 'child_process';
import path from 'path';

const CLI_PATH = path.join(__dirname, '../apps/cli/src/main.ts');
const CLI_COMMAND = `npx tsx --tsconfig tsconfig.base.json ${CLI_PATH}`;

interface TestConfig {
  graphqlEndpoint: string;
  testLeagueId?: number;
  adminJwt?: string;
  userJwt?: string;
}

class DraftStatusTest {
  private config: TestConfig;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      graphqlEndpoint: config.graphqlEndpoint || 'http://localhost:3001/graphql',
      ...config
    };
  }

  /**
   * Generate a JWT using the CLI
   */
  generateJWT(email: string, accessLevel: 'none' | 'admin' = 'none', expiration = '1h'): string {
    console.log(`🔑 Generating JWT for ${email}...`);
    
    const command = [
      CLI_COMMAND,
      'generate-jwt',
      '--email', email,
      '--exp', expiration,
      '--access-level', accessLevel
    ].join(' ');

    try {
      const output = execSync(command, { 
        encoding: 'utf8',
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, NODE_ENV: 'test' }
      });

      // Extract JWT from CLI output
      const jwtMatch = output.match(/🔑 JWT Token:\n(eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/);
      
      if (!jwtMatch?.[1]) {
        throw new Error('Failed to extract JWT from CLI output');
      }

      const jwt = jwtMatch[1];
      console.log(`   ✅ Generated JWT: ${jwt.substring(0, 30)}...`);
      
      return jwt;
    } catch (error) {
      console.error(`❌ Failed to generate JWT for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Make a GraphQL request with authentication
   */
  async makeGraphQLRequest(query: string, variables: any = {}, jwt?: string): Promise<any> {
    console.log(`📡 Making GraphQL request...`);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    try {
      // Use dynamic import for fetch to work in Node.js
      const fetch = (await import('node-fetch')).default;
      
      const response = await fetch(this.config.graphqlEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
      }

      const result = await response.json() as any;
      
      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        throw new Error(`GraphQL error: ${result.errors[0].message}`);
      }

      return result;
    } catch (error) {
      console.error('❌ GraphQL request failed:', error);
      throw error;
    }
  }

  /**
   * Test server connectivity
   */
  async testConnection(): Promise<boolean> {
    console.log(`🔌 Testing connection to ${this.config.graphqlEndpoint}...`);
    
    try {
      await this.makeGraphQLRequest('{ __typename }');
      console.log('✅ GraphQL server is available');
      return true;
    } catch (error) {
      console.log('❌ GraphQL server is not available:', error.message);
      return false;
    }
  }

  /**
   * Create a test league and return its ID
   */
  async createTestLeague(jwt: string): Promise<number> {
    console.log('🏟️  Creating test league...');
    
    const mutation = `
      mutation CreateTestLeague($input: CreateLeagueInput!) {
        createLeague(input: $input) {
          id
          name
          draftStatus
          owner
        }
      }
    `;

    const input = {
      name: `Draft Test League ${Date.now()}`,
      maxRosterSize: 25
    };

    const result = await this.makeGraphQLRequest(mutation, { input }, jwt);
    const league = result.data.createLeague;
    
    console.log(`✅ Created league: ID=${league.id}, Name="${league.name}", Status=${league.draftStatus}`);
    
    return league.id;
  }

  /**
   * Add a user to a league
   */
  async addUserToLeague(leagueId: number, userId: number, jwt: string): Promise<void> {
    console.log(`👥 Adding user ${userId} to league ${leagueId}...`);
    
    const mutation = `
      mutation AddLeagueMember($input: CreateLeagueMemberInput!) {
        addLeagueMember(input: $input) {
          leagueId
          userId
          permissionLevel
        }
      }
    `;

    const input = {
      leagueId,
      userId,
      permissionLevel: 'commissioner'
    };

    await this.makeGraphQLRequest(mutation, { input }, jwt);
    console.log(`✅ User ${userId} added to league ${leagueId}`);
  }

  /**
   * Get league details
   */
  async getLeague(leagueId: number, jwt: string): Promise<any> {
    console.log(`🔍 Fetching league ${leagueId}...`);
    
    const query = `
      query GetLeague($id: Int!) {
        league(id: $id) {
          id
          name
          draftStatus
          owner
        }
      }
    `;

    const result = await this.makeGraphQLRequest(query, { id: leagueId }, jwt);
    const league = result.data.league;
    
    console.log(`📊 League details: ID=${league.id}, Status=${league.draftStatus}`);
    
    return league;
  }

  /**
   * Start a draft for a league
   */
  async startDraft(leagueId: number, draftType: string, jwt: string): Promise<any> {
    console.log(`🎯 Starting ${draftType} draft for league ${leagueId}...`);
    
    const mutation = `
      mutation StartDraft($leagueId: Int!, $draftType: String!) {
        startDraft(leagueId: $leagueId, draftType: $draftType) {
          id
          name
          draftStatus
        }
      }
    `;

    const result = await this.makeGraphQLRequest(mutation, { leagueId, draftType }, jwt);
    const league = result.data.startDraft;
    
    console.log(`📊 Draft started: ID=${league.id}, Status=${league.draftStatus}`);
    
    return league;
  }

  /**
   * Main test execution
   */
  async runTest(): Promise<boolean> {
    console.log('\n🚀 DRAFT STATUS UPDATE TEST');
    console.log('===========================\n');

    try {
      // Step 1: Test server connection
      const serverAvailable = await this.testConnection();
      if (!serverAvailable) {
        console.log('⚠️  Server not available - test cannot run');
        console.log('💡 To run this test:');
        console.log('   1. Start the GraphQL server: cd lambdas/db && npm run dev');
        console.log('   2. Run this test again');
        return false;
      }

      // Step 2: Generate authentication tokens
      console.log('\n🔐 Setting up authentication...');
      const adminJwt = this.generateJWT('admin@test.com', 'admin', '1h');
      const userJwt = this.generateJWT('user@test.com', 'none', '1h');

      // Step 3: Create test league
      console.log('\n🏗️  Setting up test data...');
      const leagueId = await this.createTestLeague(adminJwt);
      await this.addUserToLeague(leagueId, 1, adminJwt); // Add user ID 1 to league

      // Step 4: Verify initial draft status
      console.log('\n📋 Verifying initial state...');
      const initialLeague = await this.getLeague(leagueId, userJwt);
      
      if (initialLeague.draftStatus !== 'not-started') {
        throw new Error(`Expected initial draft status to be 'not-started', got '${initialLeague.draftStatus}'`);
      }
      console.log('✅ Initial draft status confirmed: not-started');

      // Step 5: Start the draft
      console.log('\n🎯 Testing draft start...');
      const draftedLeague = await this.startDraft(leagueId, 'random-draft', userJwt);
      
      if (draftedLeague.draftStatus !== 'queued') {
        throw new Error(`Expected draft status to be 'queued' after starting, got '${draftedLeague.draftStatus}'`);
      }
      console.log('✅ Draft mutation returned correct status: queued');

      // Step 6: CRITICAL TEST - Verify persistence
      console.log('\n🔍 Testing draft status persistence...');
      
      // Add delay to ensure async operations complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const persistedLeague = await this.getLeague(leagueId, userJwt);
      
      if (persistedLeague.draftStatus !== 'queued') {
        throw new Error(`Draft status did not persist! Expected 'queued', got '${persistedLeague.draftStatus}'`);
      }
      console.log('✅ Draft status correctly persisted: queued');

      // Step 7: Multiple verification queries
      console.log('\n🔄 Testing multiple consecutive queries...');
      
      for (let i = 1; i <= 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const verificationLeague = await this.getLeague(leagueId, userJwt);
        
        if (verificationLeague.draftStatus !== 'queued') {
          throw new Error(`Draft status inconsistent on query ${i}: got '${verificationLeague.draftStatus}'`);
        }
        
        console.log(`   ✅ Query ${i}/3: Draft status still queued`);
      }

      // Step 8: Test different draft types
      console.log('\n📋 Testing draft type validation...');
      
      // Create another league for type testing
      const typeTestLeagueId = await this.createTestLeague(adminJwt);
      await this.addUserToLeague(typeTestLeagueId, 1, adminJwt);
      
      const validTypes = ['snake-draft', 'auction'];
      
      for (const draftType of validTypes) {
        console.log(`   🎯 Testing draft type: ${draftType}`);
        
        try {
          const typedLeague = await this.startDraft(typeTestLeagueId, draftType, adminJwt);
          if (typedLeague.draftStatus === 'queued') {
            console.log(`   ✅ ${draftType} accepted and processed`);
            break; // Only test one to avoid status conflicts
          }
        } catch (error) {
          console.error(`   ❌ ${draftType} failed:`, error.message);
        }
      }

      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ Draft status update functionality is working correctly');
      console.log(`📊 Test league IDs created: ${leagueId}, ${typeTestLeagueId}`);
      
      return true;

    } catch (error) {
      console.error('\n❌ TEST FAILED!');
      console.error('Error:', error.message);
      console.error('\n🔧 Troubleshooting tips:');
      console.error('1. Ensure GraphQL server is running (cd lambdas/db && npm run dev)');
      console.error('2. Check database connection is working');
      console.error('3. Verify JWT generation CLI command is working');
      console.error('4. Check server logs for detailed error information');
      
      return false;
    }
  }
}

// Main execution
async function main() {
  const tester = new DraftStatusTest({
    graphqlEndpoint: process.env.GRAPHQL_ENDPOINT || 'http://localhost:3001/graphql'
  });

  const success = await tester.runTest();
  process.exit(success ? 0 : 1);
}

// Handle both direct execution and module import
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { DraftStatusTest };
