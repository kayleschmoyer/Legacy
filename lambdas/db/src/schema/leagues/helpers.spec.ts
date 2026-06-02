/**
 * Unit tests for league domain helpers.
 *
 * generateSecureInviteCode (LS-5183) replaces the non-cryptographic
 * Math.random() generator previously inlined in the renewLeague mutation. These
 * tests pin the output format (length + alphabet) and assert it draws from a
 * CSPRNG rather than Math.random.
 */

import { generateSecureInviteCode } from './helpers';

const INVITE_CODE_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe('generateSecureInviteCode', () => {
  it('returns an 8-character code by default', () => {
    expect(generateSecureInviteCode()).toHaveLength(8);
  });

  it('honours an explicit length', () => {
    expect(generateSecureInviteCode(12)).toHaveLength(12);
  });

  it('only emits characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateSecureInviteCode()).toMatch(INVITE_CODE_ALPHABET);
    }
  });

  it('does not depend on Math.random', () => {
    const spy = jest.spyOn(Math, 'random');
    generateSecureInviteCode();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('produces distinct codes across calls (collision-free over a sample)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      codes.add(generateSecureInviteCode());
    }
    // 8 chars over a 32-symbol alphabet → 32^8 space; 1000 samples should be
    // collision-free in practice.
    expect(codes.size).toBe(1000);
  });
});
