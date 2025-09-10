declare module '__PLATFORM_COMPONENTS__' {
  import React from 'react';
  import { IconProps } from './platform-components/wrappers/LazyIcon';
  import { TableProps } from './platform-components/wrappers/LazyTable';

  // SecureStorage interface
  export interface SecureStorageOptions {
    requireAuthentication?: boolean;
  }

  export class SecureStorage {
    static setItem(
      key: string,
      value: string,
      options?: SecureStorageOptions,
    ): Promise<void>;
    static getItem(
      key: string,
      options?: SecureStorageOptions,
    ): Promise<string | null>;
    static removeItem(key: string): Promise<void>;
    static clear(): Promise<void>;
    static hasItem(key: string): Promise<boolean>;
  }

  // Direct exports with common names (resolved at build time)
  export const Icon: React.FC<IconProps>;
  export const Table: React.FC<TableProps>;
  export function LoadingPanel(): JSX.Element;

  // Platform-specific named exports (for advanced usage)
  export const WebIcons: React.FC<IconProps>;
  export const WebTable: React.FC<TableProps>;
  export const MobileIcons: React.FC<IconProps>;
  export const MobileTable: React.FC<TableProps>;

  // Platform-specific component exports from ReactNativeEquivalents (web only)
  export const Text: React.FC<any>;
  export const View: React.FC<any>;
  export const TouchableOpacity: React.FC<any>;
  export const StyleSheet: any;
  export const Dimensions: any;
}
