import { getRepoRoot, runCommand } from '../run-command.js';
import type { ToolResult } from '../types.js';

interface ApiGatewayInspectParams {
  path?: string;
  environment: string;
}

interface RestApi {
  id?: string;
  name?: string;
}

interface Resource {
  id?: string;
  path?: string;
  resourceMethods?: Record<string, unknown> | null;
}

interface MethodIntegration {
  type?: string;
  uri?: string;
  httpMethod?: string;
}

interface MethodResponse {
  httpMethod?: string;
  authorizationType?: string;
  methodIntegration?: MethodIntegration | null;
}

interface RouteInfo {
  resourceId: string;
  path: string;
  method: string;
  authorizationType: string | null;
  integrationType: string | null;
  integrationUri: string | null;
  hasIntegration: boolean;
  integrationError?: string;
}

export async function apigatewayInspect(
  params: ApiGatewayInspectParams,
): Promise<ToolResult> {
  const repoRoot = getRepoRoot();

  try {
    // Step 1: Find the REST API for this environment
    const apisOutput = await runCommand(
      'aws',
      ['apigateway', 'get-rest-apis', '--output', 'json'],
      repoRoot,
    );

    const apis = JSON.parse(apisOutput) as { items?: RestApi[] };
    const envPattern = new RegExp(`legacy-sports.*${params.environment}`, 'i');
    const api = (apis.items ?? []).find((a) => envPattern.test(a.name ?? ''));

    if (!api?.id) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: `No API Gateway REST API found matching environment "${params.environment}".`,
              availableApis: (apis.items ?? []).map((a) => a.name),
            }),
          },
        ],
      };
    }

    // Step 2: Get all resources with embedded methods to avoid per-method API calls
    const resourcesOutput = await runCommand(
      'aws',
      [
        'apigateway',
        'get-resources',
        '--rest-api-id',
        api.id,
        '--embed',
        'methods',
        '--output',
        'json',
      ],
      repoRoot,
    );

    const resources = JSON.parse(resourcesOutput) as { items?: Resource[] };
    let matchingResources = resources.items ?? [];

    // Filter by path pattern if provided
    if (params.path) {
      let pathPattern: RegExp;
      try {
        pathPattern = new RegExp(params.path, 'i');
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: `Invalid path pattern: "${params.path}". Please provide a valid regular expression.`,
                environment: params.environment,
                details: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
      matchingResources = matchingResources.filter((r) =>
        pathPattern.test(r.path ?? ''),
      );
    }

    if (matchingResources.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              apiName: api.name,
              apiId: api.id,
              matchingRoutes: 0,
              message: params.path
                ? `No routes matching "${params.path}" found.`
                : 'No routes found.',
            }),
          },
        ],
      };
    }

    // Step 3: Extract method details from embedded resource data
    const routes: RouteInfo[] = [];

    for (const resource of matchingResources) {
      if (!resource.id || !resource.path) continue;

      const methods = Object.keys(resource.resourceMethods ?? {});
      if (methods.length === 0) continue;

      for (const method of methods) {
        const methodData = resource.resourceMethods?.[method] as
          | MethodResponse
          | undefined;

        if (methodData) {
          const integration = methodData.methodIntegration;

          routes.push({
            resourceId: resource.id,
            path: resource.path,
            method,
            authorizationType: methodData.authorizationType ?? null,
            integrationType: integration?.type ?? null,
            integrationUri: integration?.uri ?? null,
            hasIntegration: integration?.type != null,
          });
        } else {
          // Embedded data not available for this method — fall back to get-method
          try {
            const methodOutput = await runCommand(
              'aws',
              [
                'apigateway',
                'get-method',
                '--rest-api-id',
                api.id,
                '--resource-id',
                resource.id,
                '--http-method',
                method,
                '--output',
                'json',
              ],
              repoRoot,
            );

            const fetchedMethod = JSON.parse(methodOutput) as MethodResponse;
            const integration = fetchedMethod.methodIntegration;

            routes.push({
              resourceId: resource.id,
              path: resource.path,
              method,
              authorizationType: fetchedMethod.authorizationType ?? null,
              integrationType: integration?.type ?? null,
              integrationUri: integration?.uri ?? null,
              hasIntegration: integration?.type != null,
            });
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            const isNotFound =
              /integration.*not defined|not found|NotFoundException/i.test(
                errorMessage,
              );

            routes.push({
              resourceId: resource.id,
              path: resource.path,
              method,
              authorizationType: null,
              integrationType: null,
              integrationUri: null,
              hasIntegration: false,
              integrationError: isNotFound
                ? undefined
                : `Failed to fetch method details: ${errorMessage}`,
            });
          }
        }
      }
    }

    const brokenRoutes = routes.filter((r) => !r.hasIntegration);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: true,
            apiName: api.name,
            apiId: api.id,
            matchingRoutes: routes.length,
            brokenRoutes: brokenRoutes.length,
            routes,
            ...(brokenRoutes.length > 0
              ? {
                  warning: `${brokenRoutes.length} route(s) have no integration attached.`,
                }
              : {}),
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isSsoError =
      /sso session.*expired|sso.*expired|credentials.*expired|InvalidClientTokenId|ExpiredToken/i.test(
        message,
      );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ok: false,
            error: message,
            remedy: isSsoError
              ? 'Run `aws sso login` to re-authenticate, then retry.'
              : undefined,
          }),
        },
      ],
      isError: true,
    };
  }
}
