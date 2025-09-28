export function getEnvVarRequired<T extends string>(envVar: T): string {
  const value = getEnvVarOptional(envVar);

  if (value === undefined) {
    throw new Error(`Required env var ${envVar} was not specified!`);
  }

  return value;
}

export function getEnvVarOptional<T extends string>(
  envVar: T,
): string | undefined {
  const value = process.env[envVar];
  return value;
}

export function getEnvVarWithDefault<T extends string>(
  envVar: T,
  defaultValue: string,
): string {
  const result = getEnvVarOptional(envVar);
  return result === undefined ? defaultValue : result;
}
