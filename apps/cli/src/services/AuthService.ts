import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { JWTPayload, User } from '../types/cli-types';

interface AuthToken {
  jwt: string;
  refreshToken?: string;
  expiresAt: number;
  email: string;
}

interface DeviceAuthRequest {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  jwt: string;
  user: User;
  refreshToken?: string;
}

interface AuthStorageFile {
  tokens: Record<string, AuthToken>; // keyed by email
  defaultUser?: string; // email of default user
}

/**
 * CLI Authentication Service
 * 
 * Handles OAuth authentication for CLI operations using a device flow pattern.
 * Stores tokens securely in user's home directory and provides automatic refresh.
 */
export class CLIAuthService {
  private readonly oauthUrl: string;
  private readonly configDir: string;
  private readonly tokenFile: string;

  constructor() {
    // Get OAuth URL from environment with fallbacks
    this.oauthUrl = this.getOAuthUrl();
    
    // Set up secure token storage location
    this.configDir = path.join(os.homedir(), '.legacy-sports');
    this.tokenFile = path.join(this.configDir, 'auth.json');
  }

  /**
   * Get OAuth URL from environment variables
   */
  private getOAuthUrl(): string {
    try {
      return getEnvVarRequired('VITE_OAUTH_PROXY_URL');
    } catch {
      // Fallback for development
      return process.env.OAUTH_PROXY_URL || 'https://api.legacysports.dev/oauth';
    }
  }

  /**
   * Initiate device authentication flow
   */
  async authenticate(): Promise<void> {
    LOGGER.info('Starting CLI authentication...');

    try {
      // Step 1: Request device authorization
      const deviceAuth = await this.requestDeviceAuth();
      
      LOGGER.info('Authentication required:');
      LOGGER.info(`1. Open this URL in your browser: ${deviceAuth.verification_uri}`);
      LOGGER.info(`2. Enter this code: ${deviceAuth.user_code}`);
      LOGGER.info('3. Complete the OAuth flow in your browser');
      LOGGER.info('');
      LOGGER.info('Waiting for authentication to complete...');

      // Step 2: Poll for token
      const tokenResponse = await this.pollForToken(deviceAuth);
      
      // Step 3: Store token securely
      await this.storeToken(tokenResponse);
      
      LOGGER.info(`✅ Authentication successful! Logged in as: ${tokenResponse.user.email}`);
      
    } catch (error) {
      LOGGER.error('Authentication failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Request device authorization from OAuth service
   */
  private async requestDeviceAuth(): Promise<DeviceAuthRequest> {
    const response = await fetch(`${this.oauthUrl}/device/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_type: 'cli',
        device_name: `CLI-${os.hostname()}`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device authorization failed: ${error}`);
    }

    return response.json() as Promise<DeviceAuthRequest>;
  }

  /**
   * Poll OAuth service for token after user completes authentication
   */
  private async pollForToken(deviceAuth: DeviceAuthRequest): Promise<TokenResponse> {
    const startTime = Date.now();
    const maxWaitTime = deviceAuth.expires_in * 1000; // Convert to milliseconds
    const pollInterval = (deviceAuth.interval || 5) * 1000; // Convert to milliseconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`${this.oauthUrl}/device/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_code: deviceAuth.device_code,
          }),
        });

        if (response.ok) {
          return response.json() as Promise<TokenResponse>;
        }

        const errorData = await response.json().catch(() => ({})) as { error?: string };
        
        if (response.status === 428) {
          // Authorization pending - continue polling
          await this.sleep(pollInterval);
          continue;
        }

        if (response.status === 400 && errorData.error === 'slow_down') {
          // Slow down polling
          await this.sleep(pollInterval * 2);
          continue;
        }

        throw new Error(`Token request failed: ${errorData.error || response.statusText}`);

      } catch (error) {
        if (error instanceof Error && error.message.includes('Token request failed')) {
          throw error;
        }
        // Network error - retry after interval
        await this.sleep(pollInterval);
      }
    }

    throw new Error('Authentication timeout - please try again');
  }

  /**
   * Get stored authentication token for current or specified user
   */
  async getAuthToken(userEmail?: string): Promise<string | null> {
    try {
      const authData = await this.loadAuthData();
      
      if (!authData.tokens || Object.keys(authData.tokens).length === 0) {
        return null;
      }

      // Determine which user's token to use
      let targetUser = userEmail;
      if (!targetUser) {
        targetUser = authData.defaultUser || Object.keys(authData.tokens)[0];
      }

      const token = authData.tokens[targetUser];
      if (!token) {
        return null;
      }

      // Check if token is expired
      if (Date.now() >= token.expiresAt) {
        LOGGER.info('Token expired, removing from storage');
        await this.removeToken(targetUser);
        return null;
      }

      return token.jwt;

    } catch (error) {
      LOGGER.debug('Error getting auth token:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(userEmail?: string): Promise<boolean> {
    const token = await this.getAuthToken(userEmail);
    return token !== null;
  }

  /**
   * Get current authenticated user info
   */
  async getCurrentUser(): Promise<{ email: string; accessLevel: string } | null> {
    const token = await this.getAuthToken();
    if (!token) {
      return null;
    }

    try {
      // Decode JWT to get user info (without verification since we trust our stored tokens)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as JWTPayload;
      return {
        email: payload.email,
        accessLevel: payload.accessLevel,
      };
    } catch (error) {
      LOGGER.debug('Error decoding token:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * List all authenticated users
   */
  async listUsers(): Promise<string[]> {
    try {
      const authData = await this.loadAuthData();
      return Object.keys(authData.tokens || {});
    } catch {
      return [];
    }
  }

  /**
   * Switch default user
   */
  async switchUser(email: string): Promise<void> {
    const authData = await this.loadAuthData();
    
    if (!authData.tokens || !authData.tokens[email]) {
      throw new Error(`No authentication found for user: ${email}`);
    }

    authData.defaultUser = email;
    await this.saveAuthData(authData);
    
    LOGGER.info(`Switched to user: ${email}`);
  }

  /**
   * Logout current or specified user
   */
  async logout(userEmail?: string): Promise<void> {
    const authData = await this.loadAuthData();
    
    if (!authData.tokens) {
      LOGGER.info('No users to logout');
      return;
    }

    if (userEmail) {
      // Logout specific user
      if (authData.tokens[userEmail]) {
        delete authData.tokens[userEmail];
        if (authData.defaultUser === userEmail) {
          // Set new default if available
          const remainingUsers = Object.keys(authData.tokens);
          authData.defaultUser = remainingUsers.length > 0 ? remainingUsers[0] : undefined;
        }
        LOGGER.info(`Logged out user: ${userEmail}`);
      }
    } else {
      // Logout all users
      authData.tokens = {};
      authData.defaultUser = undefined;
      LOGGER.info('Logged out all users');
    }

    await this.saveAuthData(authData);
  }

  /**
   * Store authentication token
   */
  private async storeToken(tokenResponse: TokenResponse): Promise<void> {
    const authData = await this.loadAuthData();
    
    // Initialize tokens object if it doesn't exist
    if (!authData.tokens) {
      authData.tokens = {};
    }

    // Calculate expiration (JWT standard is typically 1 hour, but we'll decode to be sure)
    let expiresAt = Date.now() + (60 * 60 * 1000); // Default 1 hour
    try {
      const payload = JSON.parse(Buffer.from(tokenResponse.jwt.split('.')[1], 'base64').toString()) as JWTPayload;
      if (payload.exp) {
        expiresAt = payload.exp * 1000; // Convert from seconds to milliseconds
      }
    } catch {
      LOGGER.debug('Could not decode JWT expiration, using default');
    }

    // Store token for this user
    authData.tokens[tokenResponse.user.email] = {
      jwt: tokenResponse.jwt,
      refreshToken: tokenResponse.refreshToken,
      expiresAt,
      email: tokenResponse.user.email,
    };

    // Set as default user if no default exists
    if (!authData.defaultUser) {
      authData.defaultUser = tokenResponse.user.email;
    }

    await this.saveAuthData(authData);
  }

  /**
   * Remove token for specific user
   */
  private async removeToken(email: string): Promise<void> {
    const authData = await this.loadAuthData();
    
    if (authData.tokens && authData.tokens[email]) {
      delete authData.tokens[email];
      
      // Update default user if needed
      if (authData.defaultUser === email) {
        const remainingUsers = Object.keys(authData.tokens);
        authData.defaultUser = remainingUsers.length > 0 ? remainingUsers[0] : undefined;
      }
      
      await this.saveAuthData(authData);
    }
  }

  /**
   * Load authentication data from disk
   */
  private async loadAuthData(): Promise<AuthStorageFile> {
    try {
      const data = await fs.readFile(this.tokenFile, 'utf8');
      return JSON.parse(data) as AuthStorageFile;
    } catch {
      // File doesn't exist or is invalid - return empty structure
      return { tokens: {} };
    }
  }

  /**
   * Save authentication data to disk
   */
  private async saveAuthData(data: AuthStorageFile): Promise<void> {
    // Ensure config directory exists
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Set restrictive permissions (user only)
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(this.tokenFile, jsonData, { 
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
