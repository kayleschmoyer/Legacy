import { getRepoOwnerName } from '../auth.js';
import { githubRest } from '../github-api.js';
import type { ToolResult } from '../types.js';

interface GetBranchProtectionParams {
  branch: string;
}

interface ClassicProtection {
  required_status_checks?: {
    contexts: string[];
    strict: boolean;
  };
  required_pull_request_reviews?: {
    required_approving_review_count: number;
  };
  required_conversation_resolution?: {
    enabled: boolean;
  };
}

interface Ruleset {
  id: number;
  name: string;
  enforcement: string;
}

interface RulesetDetail {
  id: number;
  name: string;
  enforcement: string;
  rules: Array<{
    type: string;
    parameters?: {
      required_status_checks?: Array<{ context: string }>;
    };
  }>;
}

export async function getBranchProtection(
  params: GetBranchProtectionParams,
): Promise<ToolResult> {
  try {
    const repo = await getRepoOwnerName();
    const branch = params.branch || 'main';

    // Classic branch protection — may 404 if not configured or caller lacks admin
    let classicStatusChecks: string[] = [];
    let requireConversationResolution = false;
    let requiredReviewCount = 0;

    try {
      const protection = await githubRest<ClassicProtection>({
        method: 'GET',
        path: `/repos/${repo.owner}/${repo.name}/branches/${branch}/protection`,
      });
      classicStatusChecks = protection.required_status_checks?.contexts ?? [];
      requireConversationResolution =
        protection.required_conversation_resolution?.enabled ?? false;
      requiredReviewCount =
        protection.required_pull_request_reviews
          ?.required_approving_review_count ?? 0;
    } catch {
      // 404 = no classic protection configured; 403 = no admin access — both are acceptable
    }

    // Repository rulesets
    const rulesets = await githubRest<Ruleset[]>({
      method: 'GET',
      path: `/repos/${repo.owner}/${repo.name}/rulesets`,
    });

    const rulesetSummaries = rulesets.map((r) => ({
      id: r.id,
      name: r.name,
      enforcement: r.enforcement,
    }));

    // Collect required status checks from active rulesets
    const rulesetStatusChecks: string[] = [];
    for (const ruleset of rulesets) {
      if (ruleset.enforcement !== 'active') continue;
      try {
        const detail = await githubRest<RulesetDetail>({
          method: 'GET',
          path: `/repos/${repo.owner}/${repo.name}/rulesets/${ruleset.id}`,
        });
        for (const rule of detail.rules) {
          if (
            rule.type === 'required_status_checks' &&
            rule.parameters?.required_status_checks
          ) {
            for (const check of rule.parameters.required_status_checks) {
              if (!rulesetStatusChecks.includes(check.context)) {
                rulesetStatusChecks.push(check.context);
              }
            }
          }
        }
      } catch {
        // Skip rulesets we can't read
      }
    }

    // Merge both sources, deduplicating
    const allRequired = Array.from(
      new Set([...classicStatusChecks, ...rulesetStatusChecks]),
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              branch,
              requiredStatusChecks: allRequired,
              requireConversationResolution,
              requiredReviewCount,
              rulesets: rulesetSummaries,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Failed to get branch protection for "${params.branch}": ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
