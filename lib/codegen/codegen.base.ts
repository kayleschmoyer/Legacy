import type { CodegenConfig } from '@graphql-codegen/cli';

// Determine the GraphQL schema endpoint from environment variables
const getGraphQLSchemaEndpoint = (): string => {
  // Try multiple environment variable patterns
  const endpoint = 
    process.env.GRAPHQL_HOST ||
    process.env.VITE_GRAPHQL_HOST || 
    process.env.EXPO_PUBLIC_GRAPHQL_HOST ||
    process.env.REACT_APP_GRAPHQL_HOST ||
    'http://localhost:5000/graphql'; // fallback for local development

  console.log(`🔗 GraphQL CodeGen using schema endpoint: ${endpoint}`);
  return endpoint;
};

const config: CodegenConfig = {
  overwrite: true,
  schema: getGraphQLSchemaEndpoint(),
  documents: 'src/api/db/**/*.graphql',
  generates: {
    'src/api/db/graphql.generated.ts': {
      config: {
        documentVariableSuffix: '',
        scalars: {
          BigInt: 'string',
          Datetime: 'string',
          Cursor: 'string',
          JSON: 'any',
          UUID: 'string',
        },
      },
      plugins: [
        {
          add: {
            content: '/* eslint-disable */',
          },
        },
        'typescript',
        'typescript-operations',
        'typescript-react-apollo',
      ],
    },
    'src/api/db/graphql.schema.json': {
      plugins: ['introspection'],
    },
  },
};

export default config;
