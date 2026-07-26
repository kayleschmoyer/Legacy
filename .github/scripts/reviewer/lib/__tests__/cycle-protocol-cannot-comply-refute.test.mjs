import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCycleRoleSection } from '../cycle-protocol.mjs';

// LS-8337: CANNOT-COMPLY previously had zero comprehension logic — no title
// classification, no prompt guidance — and index.mjs escalated to a human
// unconditionally the instant the token was detected at cycle >= 3, before
// the LLM ever ran. These assertions lock in the new prompt guidance that
// gives the bot a chance to accept or refute-with-reason instead, mirroring
// the existing JUSTIFY treatment.

describe('buildCycleRoleSection — CANNOT-COMPLY accept-or-refute-with-reason (LS-8337)', () => {
  const reasons = new Map([
    [
      'sql injection in login',
      'This file is generated and cannot be hand-edited.',
    ],
  ]);
  const cannotComply = new Set(['sql injection in login']);

  it('Cycle 2 gains a CANNOT-COMPLY: bullet in the "Evaluating author replies" list', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.match(section, /`CANNOT-COMPLY:/);
    assert.match(section, /accept and omit/i);
  });

  it('Cycle 2 forbids verbatim repetition and requires addressing the claimed reason', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.match(section, /do not repeat the original finding\s*\n?verbatim/i);
    assert.match(section, /quote the author's claimed reason/i);
  });

  it('Cycle 2 cannotComplyBlock echoes the specific claimed reason', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.match(section, /This file is generated and cannot be hand-edited\./);
  });

  it('Cycle 3 cannotComplyBlock requires quoting the reason, not repeating verbatim', () => {
    const section = buildCycleRoleSection(
      3,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.match(section, /verbatim/i);
    assert.match(section, /final verification cycle/i);
    assert.match(section, /This file is generated and cannot be hand-edited\./);
  });

  it('omits the cannotComplyBlock when there are no CANNOT-COMPLY findings', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      new Set(),
      new Map(),
    );
    assert.doesNotMatch(
      section,
      /Author posted a CANNOT-COMPLY: reply for these/,
    );
    // The generic CANNOT-COMPLY bullet in "Evaluating author replies" still exists.
    assert.match(section, /`CANNOT-COMPLY:/);
  });

  it('excludes CANNOT-COMPLY titles from the generic "must re-evaluate" list (Cycle 2)', () => {
    const section = buildCycleRoleSection(
      2,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.doesNotMatch(section, /Issues from Cycle 1 you must re-evaluate/);
  });

  it('excludes CANNOT-COMPLY titles from the generic "must verify" list (Cycle 3)', () => {
    const section = buildCycleRoleSection(
      3,
      ['SQL injection in login'],
      [],
      new Set(),
      new Set(),
      cannotComply,
      reasons,
    );
    assert.doesNotMatch(section, /Mandates from Cycle 2 you must verify/);
  });

  it('defaults cannotComplyTitles/cannotComplyReasons to empty when omitted (backward compatible)', () => {
    const section = buildCycleRoleSection(
      2,
      ['Prior issue'],
      [],
      new Set(),
      new Set(),
    );
    assert.match(section, /## Your Role This Cycle: ADJUDICATE/);
  });
});
