/** Tests for the shadow-mode selection comparator (LS-9661, AC4). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compareSelections, renderMarkdown } from '../shadow-compare.mjs';

describe('compareSelections', () => {
  it('flags specs the live map selected but the derived map missed', () => {
    const r = compareSelections({
      live: { runAll: false, specs: ['a.spec.ts', 'b.spec.ts'] },
      derived: { runAll: false, specs: ['a.spec.ts'] },
    });
    assert.deepEqual(r.missingInDerived, ['b.spec.ts']);
    assert.equal(r.escalation, 'same');
  });

  it('treats a derived full-suite as covering everything (no missing)', () => {
    const r = compareSelections({
      live: { runAll: false, specs: ['a.spec.ts'] },
      derived: { runAll: true, specs: [] },
    });
    assert.deepEqual(r.missingInDerived, []);
    assert.equal(r.escalation, 'added-by-derived');
  });

  it('reports the LS-8905 escalation-avoided case', () => {
    const r = compareSelections({
      live: { runAll: true, specs: [] },
      derived: { runAll: false, specs: ['a.spec.ts'] },
    });
    assert.equal(r.escalation, 'avoided-by-derived');
    assert.deepEqual(r.extraInDerived, []);
  });

  it('applies the promote-at threshold to both sides', () => {
    const many = Array.from({ length: 5 }, (_, i) => `s${i}.spec.ts`);
    const r = compareSelections({
      live: { runAll: false, specs: many },
      derived: { runAll: false, specs: ['s0.spec.ts'] },
      promoteAt: 5,
    });
    assert.equal(r.live.full, true);
    assert.equal(r.derived.full, false);
    assert.equal(r.escalation, 'avoided-by-derived');
  });

  it('reports over-selection separately (safe direction)', () => {
    const r = compareSelections({
      live: { runAll: false, specs: ['a.spec.ts'] },
      derived: { runAll: false, specs: ['a.spec.ts', 'c.spec.ts'] },
    });
    assert.deepEqual(r.extraInDerived, ['c.spec.ts']);
    assert.deepEqual(r.missingInDerived, []);
  });
});

describe('renderMarkdown', () => {
  it('surfaces under-selection candidates prominently', () => {
    const md = renderMarkdown(
      compareSelections({
        live: { runAll: false, specs: ['a.spec.ts', 'b.spec.ts'] },
        derived: { runAll: false, specs: ['a.spec.ts'] },
      }),
    );
    assert.match(md, /potential under-selection/);
    assert.match(md, /b\.spec\.ts/);
  });

  it('celebrates superset selections', () => {
    const md = renderMarkdown(
      compareSelections({
        live: { runAll: false, specs: ['a.spec.ts'] },
        derived: { runAll: false, specs: ['a.spec.ts'] },
      }),
    );
    assert.match(md, /superset/);
  });
});
