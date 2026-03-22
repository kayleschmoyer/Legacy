import * as Device from 'expo-device';

/** Type-safe accessor — expo-device has no type declarations in this monorepo. */
export const isPhysicalDevice: boolean =
  (Device as { isDevice?: boolean }).isDevice ?? false;
