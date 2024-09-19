import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { getEnvVarOptional } from '@legacy-sports/env-utilities';

// Create client outside of handler to reuse
export const secretsClient = new SecretsManagerClient({
  region: 'us-east-1',
});

export interface SecretConfiguration {
  localEnvVar: string | undefined;
  secretPathEnvVar: string;
}

export async function readSecret(config: SecretConfiguration): Promise<string> {
  if (config.localEnvVar) {
    const envVarValue = getEnvVarOptional(config.localEnvVar);

    if (envVarValue !== undefined) {
      return envVarValue;
    }
  }

  const secretKeyPath = getEnvVarOptional(config.secretPathEnvVar);

  if (secretKeyPath === undefined) {
    throw new Error(
      `A value must be provided to retrieve secret configuration. Secret Path: ${config.secretPathEnvVar}`
    );
  }

  return await retrieveSecretParameterValue(secretKeyPath);
}

export async function retrieveSecretParameterValue(
  secret_name: string
): Promise<string> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: secret_name,
      VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
    })
  );

  if (response.SecretString === undefined) {
    throw new Error(`${secret_name} is undefined!`);
  }

  return response.SecretString;
}
