/* eslint-disable @nx/enforce-module-boundaries */
import config from '../../lib/codegen/codegen.base';

config.schema = process.env.EXPO_PUBLIC_GRAPHQL_HOST || 'http://localhost:5000/graphql';
export default config;
