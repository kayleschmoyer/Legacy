/**
 * Version and deployment information utilities
 *
 * Version information is injected at build time via environment variables:
 * - COMMIT_SHA or VITE_COMMIT_SHA: Git commit hash (40 chars)
 * - BUILD_TIMESTAMP or VITE_BUILD_TIMESTAMP: ISO 8601 timestamp of when the build was created
 * - VERSION or VITE_VERSION: Semantic version (from package.json or SSM)
 * - BRANCH or VITE_BRANCH: Git branch name
 *
 * This utility is primarily for Lambda/Node.js environments.
 * For web applications, use the environment config from apps/web/src/config/environment.ts
 */

export interface VersionInfo {
  /** Git commit SHA (short 7-char or full 40-char) */
  commitSha: string;
  /** ISO 8601 timestamp of build */
  buildTimestamp: string;
  /** Semantic version (e.g., "1.2.3") */
  version: string;
  /** Git branch name */
  branch: string;
  /** Environment/stage (dev, staging, prod) */
  environment: string;
  /** Service/artifact name */
  serviceName: string;
}

/**
 * Get version information from environment variables (Node.js)
 * Works in Lambda and other Node.js environments
 */
export function getVersionInfo(serviceName = 'unknown'): VersionInfo {
  const env = process.env;

  return {
    commitSha: env['VITE_COMMIT_SHA'] || env['COMMIT_SHA'] || 'unknown',
    buildTimestamp:
      env['VITE_BUILD_TIMESTAMP'] || env['BUILD_TIMESTAMP'] || 'unknown',
    version: env['VITE_VERSION'] || env['VERSION'] || '0.0.0',
    branch: env['VITE_BRANCH'] || env['BRANCH'] || 'unknown',
    environment:
      env['AWS_STAGE'] || env['VITE_ENV'] || env['NODE_ENV'] || 'development',
    serviceName,
  };
}

/**
 * Format version info as a readable string
 */
export function formatVersionInfo(info: VersionInfo): string {
  const shortSha = info.commitSha.substring(0, 7);
  return `${info.serviceName} v${info.version} (${shortSha}) built ${info.buildTimestamp} on ${info.branch}`;
}

/**
 * Get a short version identifier (for logging)
 */
export function getShortVersion(info: VersionInfo): string {
  const shortSha = info.commitSha.substring(0, 7);
  return `v${info.version}-${shortSha}`;
}
