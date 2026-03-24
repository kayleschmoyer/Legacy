import { getRepoOwnerName } from './auth.js';
import { githubGraphQL } from './github-api.js';

export interface PRCommitResponse {
  repository: {
    pullRequest: {
      commits: {
        nodes: Array<{
          commit: { oid: string };
        }>;
      };
    } | null;
  };
}

export const PR_HEAD_COMMIT_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      commits(last: 1) {
        nodes {
          commit { oid }
        }
      }
    }
  }
}`;

/**
 * Resolve the head commit SHA for a pull request.
 * Returns the SHA string, or null if the PR is not found or has no commits.
 */
export async function resolveHeadShaFromPrNumber(
  prNumber: number,
): Promise<string | null> {
  const repo = await getRepoOwnerName();
  const prResponse = await githubGraphQL<PRCommitResponse>(
    PR_HEAD_COMMIT_QUERY,
    { owner: repo.owner, repo: repo.name, number: prNumber },
  );

  const commits = prResponse.data.repository.pullRequest?.commits.nodes;
  if (!commits?.length) {
    return null;
  }

  return commits[0].commit.oid;
}
