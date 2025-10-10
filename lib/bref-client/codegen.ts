/* eslint-disable @nx/enforce-module-boundaries */
import config from '../codegen/codegen.base';

// The base config now handles dynamic schema endpoint detection
// No need to override it here since it already checks all environment variables
export default config;
