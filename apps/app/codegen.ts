/* eslint-disable @nx/enforce-module-boundaries -- codegen config must import shared base cross-boundary */
import config from '../../lib/codegen/codegen.base';

// The base config now handles dynamic schema endpoint detection
// No need to override it here since it already checks EXPO_PUBLIC_GRAPHQL_HOST
export default config;
