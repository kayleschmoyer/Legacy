import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCycleRoleSection } from '../cycle-protocol.mjs';

// LS-8312 AC3: a re-review following a JUSTIFY must explicitly address the
// author's rationale (accept or refute-with-reason) rather than repeating the
// original finding verbatim. These assertions lock in the prompt guidance that
// drives that behaviour.

describe('buildCycleRoleSection — JUSTIFY refute-with-reason (AC3)', () => {
  const justified = new Set(['sql injection in login']);

  it('Cycle 2 forbids verbatim repetition and requires rebutting the rationale', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      justified,
    );
    assert.match(section, /verbatim/i);
    // The generic JUSTIFY guidance requires quoting + refuting the rationale.
    assert.match(section, /rationale/i);
    assert.match(section, /address the author's rationale/i);
  });

  it('Cycle 2 justified-titles block spells out the no-verbatim rule', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      justified,
    );
    assert.match(section, /do not repeat the original finding verbatim/i);
  });

  it('Cycle 3 justified-titles block requires quoting the rationale, not repeating verbatim', () => {
    const section = buildCycleRoleSection(
      3,
      ['SQL injection in login'],
      [],
      new Set(),
      justified,
    );
    assert.match(section, /verbatim/i);
    assert.match(section, /rationale/i);
  });

  it('omits the verbatim guidance when there are no justified findings', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
    );
    // The per-title justified block should be absent, but the generic JUSTIFY
    // bullet (which also carries the no-verbatim rule) remains.
    assert.doesNotMatch(
      section,
      /Author posted a JUSTIFY: reply for these findings/,
    );
  });
});
