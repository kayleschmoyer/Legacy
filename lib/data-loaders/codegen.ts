/* eslint-disable @nx/enforce-module-boundaries */
import config from '../codegen/codegen.base';

config.schema = process.env.GRAPHQL_HOST || 'http://localhost:5000/graphql';
export default config;
