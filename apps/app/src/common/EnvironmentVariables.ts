export enum EnvironmentVariable {
  GOOGLE_OAUTH_CLIENT_ID = 'EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID',
  GRAPHQL_HOST = 'EXPO_PUBLIC_GRAPHQL_HOST',
  OAUTH_PROXY = 'EXPO_PUBLIC_OAUTH_PROXY',
}

export function getEnvVarRequired(envVar: EnvironmentVariable): string {
  const value = process.env[envVar];

  if (value === undefined) {
    throw new Error(`Required env var ${envVar} was not specified!`);
  }

  return value;
}
