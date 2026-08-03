// Apollo Client 4.x splits useQuery (and other React hooks) into a separate
// subpath export. The root @apollo/client resolves to core-only in Jest's CJS
// context, which omits those hooks. This shim merges core + react bundles so
// codegen-generated files (import * as Apollo from '@apollo/client') can find
// Apollo.useQuery, Apollo.useLazyQuery, etc.
//
// We use relative paths to bypass the package.json `exports` field (which does
// not expose __cjs/* subpaths as valid specifiers).
//
// IMPORTANT: We pre-assign core to module.exports BEFORE requiring react.
// The react hooks internally do require('@apollo/client'), which Jest maps back
// to this shim. Node's CJS loader returns module.exports at that point (circular
// dep handling), so pre-populating it with core lets the hooks get a valid object.
const core = require('../../node_modules/@apollo/client/__cjs/core/index.cjs');
Object.assign(module.exports, core);
const react = require('../../node_modules/@apollo/client/__cjs/react/index.cjs');
Object.assign(module.exports, react);
