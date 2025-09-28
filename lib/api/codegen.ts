import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: process.env.VITE_GRAPHQL_HOST || 'http://localhost:5000/graphql',
  documents: [
    'src/shared/hello.query.graphql',
    'src/resources/players/*.graphql',
  ],
  generates: {
    'src/shared/graphql.generated.ts': {
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
