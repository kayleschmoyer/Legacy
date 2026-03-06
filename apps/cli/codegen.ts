/* eslint-disable @nx/enforce-module-boundaries -- codegen config must import shared base cross-boundary */
import config from '../../lib/codegen/codegen.base';

// The base config now handles dynamic schema endpoint detection
// No need to override it here since it already checks all environment variables
export default config;
