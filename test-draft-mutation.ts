#!/usr/bin/env node

// Test script to verify startDraft mutation behavior  } catch (error) {
    console.log('❌ Error during test:', error);
    if (error instanceof Error) {
      console.log('Error message:', error.message);
    }
    // Print GraphQL errors if available
    if (error && typeof error === 'object' && 'graphQLErrors' in error) {
      console.log('GraphQL Errors:', JSON.stringify(error.graphQLErrors, null, 2));
    }
    if (error && typeof error === 'object' && 'networkError' in error && error.networkError) {
      console.log('Network Error Result:', JSON.stringify(error.networkError.result, null, 2));
    }
  }
}

import { ApolloClient, InMemoryCache, gql, createHttpLink } from '@apollo/client/core/index.js';

const httpLink = createHttpLink({
  uri: 'http://localhost:5000/graphql'
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache()
});

const GET_LEAGUE_QUERY = gql`
  query GetLeague($id: Int!) {
    league(id: $id) {
      id
      name
      draftStatus
    }
  }
`;

const START_DRAFT_MUTATION = gql`
  mutation StartDraft($leagueId: Int!, $draftType: String) {
    startDraft(leagueId: $leagueId, draftType: $draftType)
  }
`;

async function testDraftMutation() {
  const leagueId = 1;
  
  try {
    // Get initial status
    console.log('🔍 Checking initial league status...');
    const initialResult = await client.query({
      query: GET_LEAGUE_QUERY,
      variables: { id: leagueId },
      fetchPolicy: 'network-only' // Skip cache
    });
    
    console.log('Initial draft status:', initialResult.data.league?.draftStatus);
    
    // Start draft
    console.log('\n🚀 Starting draft...');
    const mutationResult = await client.mutate({
      mutation: START_DRAFT_MUTATION,
      variables: {
        leagueId: leagueId,
        draftType: 'random-draft'
      }
    });
    
    console.log('Mutation result:', mutationResult.data?.startDraft);
    
    // Check status after mutation (with fresh fetch)
    console.log('\n🔍 Checking status after mutation...');
    const finalResult = await client.query({
      query: GET_LEAGUE_QUERY,
      variables: { id: leagueId },
      fetchPolicy: 'network-only' // Skip cache
    });
    
    console.log('Final draft status:', finalResult.data.league?.draftStatus);
    
    // Verify the change
    if (finalResult.data.league?.draftStatus === 'queued') {
      console.log('\n✅ SUCCESS: Draft status correctly updated to "queued"');
    } else {
      console.log('\n❌ FAILURE: Draft status was not updated correctly');
      console.log('Expected: "queued", Got:', finalResult.data.league?.draftStatus);
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

console.log('🧪 Testing startDraft mutation behavior...\n');
testDraftMutation().then(() => {
  console.log('\n🏁 Test completed');
}).catch(console.error);
