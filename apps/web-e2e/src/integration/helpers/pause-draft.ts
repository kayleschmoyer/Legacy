import type { APIRequestContext } from '@playwright/test';
import { graphqlOk } from './graphql';

/**
 * Pause an in-progress draft as the commissioner. Auto-picks halt until
 * `resumeDraft` is called, keeping the live draft board rendered in a
 * deterministic state for assertions.
 *
 * Use this in integration specs that need the draft to stay live for the
 * duration of the test run rather than racing the AI auto-pick to completion.
 */
export async function pauseDraft(
  apiCommissioner: APIRequestContext,
  leagueId: number,
): Promise<void> {
  await graphqlOk(
    apiCommissioner,
    `mutation PauseDraftForTest($leagueId: Int!) {
      pauseDraft(leagueId: $leagueId) { id status }
    }`,
    { leagueId },
  );
}

/**
 * Resume a previously paused draft. Best-effort: callers should typically
 * invoke this in afterAll and swallow errors, since the league fixture
 * teardown removes the league regardless.
 */
export async function resumeDraft(
  apiCommissioner: APIRequestContext,
  leagueId: number,
): Promise<void> {
  await graphqlOk(
    apiCommissioner,
    `mutation ResumeDraftForTest($leagueId: Int!) {
      resumeDraft(leagueId: $leagueId) { id status }
    }`,
    { leagueId },
  );
}
