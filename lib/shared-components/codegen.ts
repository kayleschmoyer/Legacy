import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  // Use the local PostGraphile server with full database schema
  schema:
    process.env.GRAPHQL_HOST ||
    process.env.VITE_GRAPHQL_HOST ||
    'http://localhost:5000/graphql',
  documents: [
    'src/api/db/**/*.graphql',
    'src/features/**/PlayerStatsQueries.ts',
  ],
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
  },
};

export default config;
