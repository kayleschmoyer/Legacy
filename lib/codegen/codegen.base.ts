import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
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
        'typed-document-node',
        'typescript-operations',
        'typescript',
        'typescript-apollo-client-helpers',
      ],
    },
    'src/api/db/graphql.schema.json': {
      plugins: ['introspection'],
    },
    'src/api/db/': {
      preset: 'near-operation-file',
      presetConfig: {
        extension: '.generated.ts',
        baseTypesPath: './graphql.generated.ts',
      },
      config: {
        importOperationTypesFrom: 'Types',
        documentMode: 'external',
        importDocumentNodeExternallyFrom: '../graphql.generated',
      },
      plugins: [
        {
          add: {
            content: '/* eslint-disable */',
          },
        },
        'typescript-react-apollo',
      ],
    },
  },
};

export default config;
