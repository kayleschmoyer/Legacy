import { LOGGER } from '@legacy-sports/logging';
import { CLIAuthService } from './AuthService';
import { GraphQLResponse } from '../types/cli-types';

/**
 * Authentication middleware for CLI commands
 *
 * Ensures the user is authenticated before running database operations
 * and provides the authentication token for API calls
 */
export class AuthMiddleware {
  private authService: CLIAuthService;

  constructor() {
    this.authService = new CLIAuthService();
  }

  /**
   * Require authentication before running a command
   * Returns the JWT token if authenticated, throws error if not
   */
  async requireAuth(
    options: {
      userEmail?: string;
      skipIfNotConfigured?: boolean;
    } = {},
  ): Promise<string> {
    const { userEmail, skipIfNotConfigured = false } = options;

    try {
      const token = await this.authService.getAuthToken(userEmail);

      if (!token) {
        if (skipIfNotConfigured) {
          LOGGER.info(
            '⚠️  No authentication configured, proceeding without auth',
          );
          return '';
        }

        throw new Error(
          'Authentication required. Please run "cli auth login" first.',
        );
      }

      // Validate token is still good
      const currentUser = await this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error(
          'Authentication token is invalid. Please run "cli auth login" again.',
        );
      }

      LOGGER.debug(
        `✅ Authenticated as: ${currentUser.email} (${currentUser.accessLevel})`,
      );
      return token;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Authentication check failed');
    }
  }

  /**
   * Get current user information if authenticated
   */
  async getCurrentUser(): Promise<{
    email: string;
    accessLevel: string;
  } | null> {
    return await this.authService.getCurrentUser();
  }

  /**
   * Check if user has required access level
   */
  async requireAccessLevel(
    minLevel: 'admin' | 'user' | 'readonly',
  ): Promise<void> {
    const currentUser = await this.getCurrentUser();

    if (!currentUser) {
      throw new Error('Authentication required');
    }

    const accessLevels = ['readonly', 'user', 'admin'];
    const userLevelIndex = accessLevels.indexOf(currentUser.accessLevel);
    const requiredLevelIndex = accessLevels.indexOf(minLevel);

    if (userLevelIndex < requiredLevelIndex) {
      throw new Error(
        `Access denied. Required: ${minLevel}, Current: ${currentUser.accessLevel}`,
      );
    }
  }

  /**
   * Get authentication headers for API requests
   */
  async getAuthHeaders(userEmail?: string): Promise<Record<string, string>> {
    const token = await this.authService.getAuthToken(userEmail);

    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make an authenticated request to the GraphQL API
   */
  async makeAuthenticatedRequest(
    url: string,
    options: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      userEmail?: string;
    } = {},
  ): Promise<Response> {
    const { method = 'POST', body, headers = {}, userEmail } = options;

    const authHeaders = await this.getAuthHeaders(userEmail);

    const response = await fetch(url, {
      method,
      headers: {
        ...authHeaders,
        ...headers,
      },
      body,
    });

    // Handle authentication errors
    if (response.status === 401) {
      throw new Error(
        'Authentication token is invalid. Please run "cli auth login" again.',
      );
    }

    if (response.status === 403) {
      throw new Error(
        'Access denied. You do not have permission for this operation.',
      );
    }

    return response;
  }

  /**
   * Make an authenticated GraphQL query
   */
  async makeGraphQLRequest(
    query: string,
    variables: Record<string, unknown> = {},
    userEmail?: string,
  ): Promise<GraphQLResponse> {
    // Get GraphQL endpoint from environment
    const graphqlUrl = this.getGraphQLUrl();

    const response = await this.makeAuthenticatedRequest(graphqlUrl, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
      userEmail,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GraphQL request failed: ${response.status} ${errorText}`,
      );
    }

    const result = (await response.json()) as GraphQLResponse;

    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    return result;
  }

  /**
   * Get GraphQL URL from environment
   */
  getGraphQLUrl(): string {
    return (
      process.env.VITE_GRAPHQL_HOST ||
      process.env.VITE_GRAPHQL_URL ||
      process.env.GRAPHQL_URL ||
      'https://api.legacysports.dev/graphql'
    );
  }
}
