/**
 * Unit tests for the GraphQL contract gate (check-contract.mjs).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchema } from 'graphql';

import {
  classifySchemaChanges,
  validateOperationGroup,
  groupByPackage,
  formatReport,
} from '../check-contract.mjs';

const BASE_SCHEMA = /* GraphQL */ `
  type Query {
    user(id: Int!): User
    teams(limit: Int): [Team!]!
  }
  type User {
    id: Int!
    email: String!
    username: String!
    legacyField: String
  }
  type Team {
    id: Int!
    name: String!
  }
  enum Sport {
    BASEBALL
    FOOTBALL
  }
`;

describe('classifySchemaChanges', () => {
  it('reports no changes for identical schemas', () => {
    const { breaking, dangerous } = classifySchemaChanges(
      BASE_SCHEMA,
      BASE_SCHEMA,
    );
    assert.equal(breaking.length, 0);
    assert.equal(dangerous.length, 0);
  });

  it('flags a removed field as breaking', () => {
    const next = BASE_SCHEMA.replace('    legacyField: String\n', '');
    const { breaking } = classifySchemaChanges(BASE_SCHEMA, next);
    assert.ok(breaking.some((c) => /legacyField/.test(c.description)));
  });

  it('flags a field becoming non-null on an argument as breaking', () => {
    const next = BASE_SCHEMA.replace(
      'user(id: Int!)',
      'user(id: Int!, region: String!)',
    );
    const { breaking } = classifySchemaChanges(BASE_SCHEMA, next);
    // Adding a required argument is a breaking change for existing clients.
    assert.ok(breaking.length >= 1);
  });

  it('classifies a new enum value as dangerous, not breaking', () => {
    const next = BASE_SCHEMA.replace(
      '    FOOTBALL\n',
      '    FOOTBALL\n    BASKETBALL\n',
    );
    const { breaking, dangerous } = classifySchemaChanges(BASE_SCHEMA, next);
    assert.equal(breaking.length, 0);
    assert.ok(dangerous.some((c) => /BASKETBALL/.test(c.description)));
  });

  it('treats a purely additive optional field as safe', () => {
    const next = BASE_SCHEMA.replace(
      '    name: String!\n',
      '    name: String!\n    abbreviation: String\n',
    );
    const { breaking, dangerous } = classifySchemaChanges(BASE_SCHEMA, next);
    assert.equal(breaking.length, 0);
    assert.equal(dangerous.length, 0);
  });
});

describe('validateOperationGroup', () => {
  const schema = buildSchema(BASE_SCHEMA);

  it('accepts a valid operation that uses a cross-file fragment', () => {
    const documents = [
      {
        file: 'a/UserFragment.graphql',
        sdl: 'fragment U on User { id email }',
      },
      {
        file: 'a/GetUser.graphql',
        sdl: 'query GetUser($id: Int!) { user(id: $id) { ...U } }',
      },
    ];
    const errors = validateOperationGroup(schema, documents);
    assert.deepEqual(errors, []);
  });

  it('rejects an operation referencing a field the schema does not have', () => {
    const documents = [
      {
        file: 'a/Bad.graphql',
        sdl: 'query Bad { user(id: 1) { nonexistentField } }',
      },
    ];
    const errors = validateOperationGroup(schema, documents);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /nonexistentField/);
    assert.equal(errors[0].file, 'a/Bad.graphql');
  });

  it('does not flag defined-but-unused fragments', () => {
    const documents = [
      { file: 'a/Unused.graphql', sdl: 'fragment Unused on Team { id name }' },
      { file: 'a/Ok.graphql', sdl: 'query Ok { teams { id } }' },
    ];
    const errors = validateOperationGroup(schema, documents);
    assert.deepEqual(errors, []);
  });
});

describe('groupByPackage', () => {
  it('groups operation files by their package root', () => {
    const groups = groupByPackage([
      'apps/web/src/api/db/users/Users.graphql',
      'apps/web/src/api/db/teams/Teams.graphql',
      'apps/app/src/api/db/users/Users.graphql',
    ]);
    assert.equal(groups.size, 2);
    assert.equal(groups.get('apps/web').length, 2);
    assert.equal(groups.get('apps/app').length, 1);
  });
});

describe('formatReport', () => {
  it('marks clean when nothing is wrong', () => {
    const r = formatReport({
      breaking: [],
      dangerous: [],
      invalidOperations: [],
    });
    assert.equal(r.hasBreaking, false);
    assert.equal(r.hasInvalidOps, false);
    assert.match(r.body, /passed/);
  });

  it('surfaces the acknowledgement label hint on breaking changes', () => {
    const r = formatReport({
      breaking: [
        { type: 'FIELD_REMOVED', description: 'User.legacyField was removed' },
      ],
      dangerous: [],
      invalidOperations: [],
    });
    assert.equal(r.hasBreaking, true);
    assert.match(r.body, /schema-breaking-ok/);
  });

  it('lists invalid operations with their file', () => {
    const r = formatReport({
      breaking: [],
      dangerous: [],
      invalidOperations: [
        {
          file: 'apps/web/src/api/db/x.graphql',
          message: 'Cannot query field "z"',
        },
      ],
    });
    assert.equal(r.hasInvalidOps, true);
    assert.match(r.body, /apps\/web\/src\/api\/db\/x\.graphql/);
  });
});
