import { errorResult } from '../aws-error.js';
import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ApiGatewayV2InspectParams {
  apiNameFilter?: string;
  includeRoutes?: boolean;
  includeAuthorizers?: boolean;
  includeIntegrations?: boolean;
}

interface V2Api {
  ApiId?: string;
  Name?: string;
  ProtocolType?: string;
  ApiEndpoint?: string;
  RouteSelectionExpression?: string;
}

interface V2Route {
  RouteId?: string;
  RouteKey?: string;
  AuthorizationType?: string;
  AuthorizerId?: string;
  Target?: string;
}

interface V2Authorizer {
  AuthorizerId?: string;
  Name?: string;
  AuthorizerType?: string;
  IdentitySource?: string[];
  JwtConfiguration?: { Audience?: string[]; Issuer?: string };
  AuthorizerUri?: string;
}

interface V2Integration {
  IntegrationId?: string;
  IntegrationType?: string;
  IntegrationUri?: string;
  IntegrationMethod?: string;
  PayloadFormatVersion?: string;
  ConnectionType?: string;
}

interface InspectedApi {
  apiId: string;
  name: string;
  protocolType: string | null;
  apiEndpoint: string | null;
  routeSelectionExpression: string | null;
  routes?: V2Route[];
  authorizers?: V2Authorizer[];
  integrations?: V2Integration[];
}

/**
 * Page through an `aws apigatewayv2 get-*` command, following NextToken until
 * the API stops handing one back. The AWS CLI auto-paginates by default, but
 * being explicit keeps behavior stable if the user sets `AWS_PAGER` or pins
 * `--no-paginate` elsewhere.
 */
async function paginatedGet<T>(
  baseArgs: string[],
  repoRoot: string,
): Promise<T[]> {
  const collected: T[] = [];
  let nextToken: string | undefined;
  do {
    const args = [...baseArgs, '--output', 'json'];
    if (nextToken) {
      args.push('--starting-token', nextToken);
    }
    const output = await runCommand('aws', args, repoRoot);
    const parsed = JSON.parse(output) as { Items?: T[]; NextToken?: string };
    if (parsed.Items) collected.push(...parsed.Items);
    nextToken = parsed.NextToken;
  } while (nextToken);
  return collected;
}

export async function apigatewayV2Inspect(
  params: ApiGatewayV2InspectParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();
  const includeRoutes = params.includeRoutes ?? true;
  const includeAuthorizers = params.includeAuthorizers ?? true;
  const includeIntegrations = params.includeIntegrations ?? true;

  try {
    let items = await paginatedGet<V2Api>(
      ['apigatewayv2', 'get-apis'],
      repoRoot,
    );

    if (params.apiNameFilter) {
      const needle = params.apiNameFilter.toLowerCase();
      items = items.filter((a) =>
        (a.Name ?? '').toLowerCase().includes(needle),
      );
    }

    if (items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              matchingApis: 0,
              message: params.apiNameFilter
                ? `No v2 APIs matching "${params.apiNameFilter}" found.`
                : 'No v2 APIs found.',
            }),
          },
        ],
      };
    }

    const inspected: InspectedApi[] = [];
    const skippedApis: Array<{ name: string; reason: string }> = [];

    for (const api of items) {
      if (!api.ApiId) {
        skippedApis.push({
          name: api.Name ?? '<unnamed>',
          reason: 'missing ApiId in get-apis response',
        });
        continue;
      }

      const entry: InspectedApi = {
        apiId: api.ApiId,
        name: api.Name ?? '',
        protocolType: api.ProtocolType ?? null,
        apiEndpoint: api.ApiEndpoint ?? null,
        routeSelectionExpression: api.RouteSelectionExpression ?? null,
      };

      if (includeRoutes) {
        entry.routes = await paginatedGet<V2Route>(
          ['apigatewayv2', 'get-routes', '--api-id', api.ApiId],
          repoRoot,
        );
      }

      if (includeAuthorizers) {
        entry.authorizers = await paginatedGet<V2Authorizer>(
          ['apigatewayv2', 'get-authorizers', '--api-id', api.ApiId],
          repoRoot,
        );
      }

      if (includeIntegrations) {
        entry.integrations = await paginatedGet<V2Integration>(
          ['apigatewayv2', 'get-integrations', '--api-id', api.ApiId],
          repoRoot,
        );
      }

      inspected.push(entry);
    }

    const hasSkipped = skippedApis.length > 0;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: !hasSkipped,
            total: items.length,
            succeeded: inspected.length,
            failed: skippedApis.length,
            apis: inspected,
            ...(hasSkipped ? { skippedApis } : {}),
          }),
        },
      ],
      ...(hasSkipped ? { isError: true } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult('apigatewayv2_inspect', message);
  }
}
