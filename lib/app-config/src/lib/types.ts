import type { CONFIG_KEYS } from './registry';

export type ConfigKey = keyof typeof CONFIG_KEYS;

type RequiredConfigKeys = {
  [K in ConfigKey]: (typeof CONFIG_KEYS)[K]['required'] extends true
    ? K
    : never;
}[ConfigKey];

type OptionalConfigKeys = Exclude<ConfigKey, RequiredConfigKeys>;

export type AppConfig = {
  [K in RequiredConfigKeys]: string;
} & {
  [K in OptionalConfigKeys]: string | undefined;
};
