/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GRAPHQL_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
