import { getEnvVarOptional } from '@legacy-sports/env-utilities';

// Mobile-safe version of AWS secrets without AWS SDK dependencies
// In mobile environments, secrets should come from environment variables or app config

export interface SecretConfiguration {
  localEnvVar: string | undefined;
  secretPathEnvVar: string;
}

export function readSecret(config: SecretConfiguration): Promise<string> {
  return new Promise((resolve, reject) => {
    // In mobile environments, always try to use local environment variables first
    if (config.localEnvVar) {
      const envVarValue = getEnvVarOptional(config.localEnvVar);
      if (envVarValue !== undefined) {
        resolve(envVarValue);
        return;
      }
    }

    // Try to get value from the secret path environment variable directly
    const secretValue = getEnvVarOptional(config.secretPathEnvVar);
    if (secretValue !== undefined) {
      resolve(secretValue);
      return;
    }

    // In mobile builds, AWS Secrets Manager is not available
    reject(
      new Error(
        `Mobile builds cannot retrieve AWS secrets. Please provide ${config.localEnvVar || config.secretPathEnvVar} as an environment variable.`,
      ),
    );
  });
}

export function retrieveSecretParameterValue(
  secret_name: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // In mobile environments, try to get the secret value from environment variables
    // This allows mobile apps to work with local configuration without AWS SDK
    const secretValue = getEnvVarOptional(secret_name);

    if (secretValue !== undefined) {
      resolve(secretValue);
      return;
    }

    reject(
      new Error(
        `Mobile builds cannot retrieve AWS secrets. Please provide ${secret_name} as an environment variable or use local configuration.`,
      ),
    );
  });
}
