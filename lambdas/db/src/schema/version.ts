import { LOGGER } from '@legacy-sports/logging';
import * as fs from 'fs';
import * as path from 'path';
import { builder } from './builder';

// Type definitions for version info
interface VersionData {
  version?: string;
  gitCommit?: string;
  deployedAt?: string;
  environment?: string;
}

interface VersionInfo {
  version: string;
  gitCommit: string;
  deployedAt: string;
  environment: string;
}

// Get version information from deployment info file or environment
const getVersionInfo = () => {
  try {
    // First, try to read version info from deployment file
    try {
      // Try multiple possible paths where version-info.json might be located
      const possiblePaths = [
        path.join(__dirname, 'version-info.json'),
        path.join(process.cwd(), 'version-info.json'),
        '/var/task/version-info.json', // Lambda runtime path
        './version-info.json',
      ];

      for (const versionInfoPath of possiblePaths) {
        if (fs.existsSync(versionInfoPath)) {
          LOGGER.debug('Found version info file', { versionInfoPath });
          const versionData = JSON.parse(
            fs.readFileSync(versionInfoPath, 'utf8'),
          ) as VersionData;
          return {
            version: versionData.version || 'unknown',
            gitCommit: versionData.gitCommit || 'unknown',
            deployedAt: versionData.deployedAt || new Date().toISOString(),
            environment: versionData.environment || 'unknown',
          };
        }
      }
      LOGGER.debug('version-info.json not found in expected locations');
    } catch (fileError) {
      LOGGER.warn('Error reading version-info.json', {
        error:
          fileError instanceof Error ? fileError.message : String(fileError),
      });
    }

    // Fallback to environment variables and package.json
    const gitCommit = process.env.GIT_COMMIT_HASH || 'dev-local';
    const deployedAt = process.env.DEPLOYED_AT || new Date().toISOString();

    let packageVersion = 'unknown';
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'),
      ) as { version?: string };
      packageVersion = pkg.version || 'unknown';
    } catch {
      packageVersion = 'dev';
    }

    return {
      version: packageVersion,
      gitCommit: gitCommit.length > 8 ? gitCommit.substring(0, 8) : gitCommit,
      deployedAt,
      environment: process.env.NODE_ENV || 'development',
    };
  } catch (error) {
    LOGGER.error('Error getting version info', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      version: 'error',
      gitCommit: 'unknown',
      deployedAt: new Date().toISOString(),
      environment: 'unknown',
    };
  }
};

// Version info type
const VersionInfo = builder.objectRef<{
  version: string;
  gitCommit: string;
  deployedAt: string;
  environment: string;
}>('VersionInfo');

VersionInfo.implement({
  description: 'Version and deployment information for the GraphQL API',
  fields: (t) => ({
    version: t.exposeString('version', {
      description: 'Package version from package.json',
    }),
    gitCommit: t.exposeString('gitCommit', {
      description: 'Git commit hash (short)',
    }),
    deployedAt: t.exposeString('deployedAt', {
      description: 'Deployment timestamp (ISO 8601)',
    }),
    environment: t.exposeString('environment', {
      description: 'Runtime environment (development, production, etc.)',
    }),
  }),
});

// Version query - public, no authentication required
builder.queryField('version', (t) =>
  t.field({
    type: VersionInfo,
    description: 'Get version and deployment information for the GraphQL API',
    resolve: () => {
      const versionInfo = getVersionInfo();
      LOGGER.debug('Version query called', { versionInfo });
      return versionInfo;
    },
  }),
);
