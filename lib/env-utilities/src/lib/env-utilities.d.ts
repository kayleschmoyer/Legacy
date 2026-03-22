export declare function getEnvVarRequired<T extends string>(envVar: T): string;
export declare function getEnvVarOptional<T extends string>(
  envVar: T,
): string | undefined;
export declare function getEnvVarWithDefault<T extends string>(
  envVar: T,
  defaultValue: string,
): string;
