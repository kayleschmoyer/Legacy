/**
 * Direct import test - verify we can import functions from db-client
 */

describe('DB Client Import Test', () => {
  it('should be able to import calculateStandings directly', async () => {
    const dbClient = await import('@legacy-sports/db-client');

    console.log('All exports from db-client:', Object.keys(dbClient));
    console.log('calculateStandings type:', typeof dbClient.calculateStandings);
    console.log(
      'getHeadToHeadRecord type:',
      typeof dbClient.getHeadToHeadRecord,
    );
    console.log(
      'getMatchupStatusCounts type:',
      typeof dbClient.getMatchupStatusCounts,
    );

    expect(typeof dbClient.calculateStandings).toBe('function');
    expect(typeof dbClient.getHeadToHeadRecord).toBe('function');
    expect(typeof dbClient.getMatchupStatusCounts).toBe('function');
  });
});
