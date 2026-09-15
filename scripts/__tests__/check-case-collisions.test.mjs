/**
 * Tests for scripts/check-case-collisions.mjs (LS-10207).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/check-case-collisions.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { findCaseCollisions, specifierOf } from '../check-case-collisions.mjs';

test('specifierOf strips resolvable extensions but keeps spec infixes', () => {
  assert.equal(specifierOf('a/Foo.tsx'), 'a/Foo');
  assert.equal(specifierOf('a/foo.spec.ts'), 'a/foo.spec');
  assert.equal(specifierOf('a/types.d.ts'), 'a/types');
  assert.equal(specifierOf('a/README.md'), 'a/README.md');
});

test('no collisions for distinct names', () => {
  assert.deepEqual(
    findCaseCollisions(['a/Foo.tsx', 'a/fooModel.ts', 'b/foo.ts']),
    [],
  );
});

test('flags files differing only by case', () => {
  assert.deepEqual(findCaseCollisions(['a/Foo.ts', 'a/foo.ts']), [
    ['a/Foo.ts', 'a/foo.ts'],
  ]);
});

test('flags extensionless specifier collisions (the LS-10207 shape)', () => {
  const paths = [
    'elite-draft/DraftPickInspector.tsx',
    'elite-draft/draftPickInspector.ts',
    'elite-draft/DraftPickInspector.spec.tsx',
    'elite-draft/draftPickInspector.spec.ts',
  ];
  assert.deepEqual(findCaseCollisions(paths), [
    ['elite-draft/DraftPickInspector', 'elite-draft/draftPickInspector'],
    [
      'elite-draft/DraftPickInspector.spec',
      'elite-draft/draftPickInspector.spec',
    ],
  ]);
});

test('flags a directory collision once, not per nested file', () => {
  assert.deepEqual(
    findCaseCollisions(['src/Utils/a.ts', 'src/utils/b.ts', 'src/utils/c.ts']),
    [['src/Utils/', 'src/utils/']],
  );
});

test('same-case extension variants are not collisions', () => {
  assert.deepEqual(findCaseCollisions(['a/foo.ts', 'a/foo.tsx']), []);
});
