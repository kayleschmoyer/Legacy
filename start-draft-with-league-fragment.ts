const { ApolloClient, InMemoryCache, gql, createHttpLink } = require('@apollo/client');

// Test script to verify startDraft mutation with League fragment return
// This tests the updated startDraft mutation that returns a League object
console.log('🧪 Testing startDraft mutation with League fragment return...\n');

const httpLink = createHttpLink({
  uri: 'http://localhost:5000/graphql'
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache()
});

// League fragment - matches the one used in the apps
const LEAGUE_FRAGMENT = gql`
  fragment League on League {
    id
    name
    owner
    maxRosterSize
    currentMatchup
    draftStatus
  }
`;

// Updated query using the fragment
const GET_LEAGUE_QUERY = gql`
  query GetLeague($id: Int!) {
    league(id: $id) {
      ...League
    }
  }
  ${LEAGUE_FRAGMENT}
`;

// Updated mutation using the fragment
const START_DRAFT_MUTATION = gql`
  mutation StartDraft($leagueId: Int!, $draftType: String) {
    startDraft(leagueId: $leagueId, draftType: $draftType) {
      ...League
    }
  }
  ${LEAGUE_FRAGMENT}
`;

async function testStartDraftMutation() {
  try {
    const leagueId = 1;
    
    // Check initial status
    console.log('🔍 Checking initial league status...');
    const initialResult = await client.query({
      query: GET_LEAGUE_QUERY,
      variables: { id: leagueId },
      fetchPolicy: 'network-only' // Skip cache
    });
    
    console.log('Initial draft status:', initialResult.data.league?.draftStatus);
    console.log('Initial league data:', JSON.stringify(initialResult.data.league, null, 2));
    
    // Start draft - now returns League object with updated status
    console.log('\n🚀 Starting draft...');
    const mutationResult = await client.mutate({
      mutation: START_DRAFT_MUTATION,
      variables: {
        leagueId: leagueId,
        draftType: 'random-draft'
      }
    });
    
    console.log('Mutation returned League object:');
    console.log(JSON.stringify(mutationResult.data?.startDraft, null, 2));
    
    const updatedLeague = mutationResult.data?.startDraft;
    
    // Verify the change
    if (updatedLeague?.draftStatus === 'queued') {
      console.log('\n✅ SUCCESS: Draft status correctly updated to "queued"');
      console.log('✅ SUCCESS: Mutation returned League object with updated status');
      console.log('🎯 CACHE BENEFIT: Apollo Client cache automatically updated with new League data');
    } else {
      console.log('\n❌ FAILURE: Draft status was not updated correctly');
      console.log('Expected: "queued", Got:', updatedLeague?.draftStatus);
    }
    
    // Verify cache was updated (should return cached data instantly)
    console.log('\n🔍 Verifying cache was updated...');
    const cachedResult = await client.query({
      query: GET_LEAGUE_QUERY,
      variables: { id: leagueId },
      fetchPolicy: 'cache-first' // Use cache first
    });
    
    console.log('Cached draft status:', cachedResult.data.league?.draftStatus);
    if (cachedResult.data.league?.draftStatus === 'queued') {
      console.log('✅ SUCCESS: Apollo Client cache properly updated!');
    } else {
      console.log('❌ Cache was not updated correctly');
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  }
}

console.log('🏁 Test completed');

testStartDraftMutation();
