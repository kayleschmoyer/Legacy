import { RuleTester } from 'eslint';

// eslint-rules/*.cjs is plain CommonJS so the root eslint.config.mjs can load
// it, which a TS `import` can't type.
const rule = jest.requireActual<Parameters<RuleTester['run']>[1]>(
  './db-client-mock.cjs',
);

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// RuleTester registers its own describe/it blocks, so it runs at top level.
ruleTester.run('db-client-mock', rule, {
  valid: [
    "jest.doMock('@legacy-sports/db-client', () => mockDbClientModule());",
    "jest.mock('@legacy-sports/db-client', () => mockDbClientModule({ createDatabaseService: jest.fn() }));",
    `jest.doMock('@legacy-sports/db-client', () => {
           const mocked = mockDbClientModule({ PublicSchema: { leagues: {} } });
           captured = mocked;
           return mocked;
         });`,
    // Automock keeps the module's full shape.
    "jest.mock('@legacy-sports/db-client');",
    "jest.doMock('drizzle-orm', () => mockDrizzleOrm({ eq: jest.fn() }));",
    `jest.doMock('drizzle-orm', () => {
       const actual = jest.requireActual('drizzle-orm');
       return { ...actual, eq: jest.fn(actual.eq) };
     });`,
    // Other modules are out of scope.
    "jest.doMock('@legacy-sports/utils/node', () => ({ getDbOptions: jest.fn() }));",
  ],
  invalid: [
    {
      code: "jest.doMock('@legacy-sports/db-client', () => ({ createDatabaseService: jest.fn() }));",
      errors: [{ messageId: 'partialMock' }],
    },
    {
      code: "jest.mock('@legacy-sports/db-client', () => ({ ...jest.requireActual('@legacy-sports/db-client'), x: 1 }));",
      errors: [{ messageId: 'partialMock' }],
    },
    {
      code: "jest.doMock('drizzle-orm', () => ({ eq: jest.fn(), sql: jest.fn() }));",
      errors: [{ messageId: 'partialMock' }],
    },
    {
      code: "jest.setMock('@legacy-sports/db-client', { PublicSchema: {} });",
      errors: [{ messageId: 'partialMock' }],
    },
  ],
});
