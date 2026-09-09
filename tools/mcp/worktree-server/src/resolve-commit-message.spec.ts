import { describe, expect, it } from '@jest/globals';

import { resolveCommitMessage } from './resolve-commit-message';

describe('resolveCommitMessage', () => {
  it('appends the generic trailer by default', () => {
    expect(resolveCommitMessage('feat(x): add thing')).toBe(
      'feat(x): add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
  });

  it('does not trim the message — callers trim at the call site as before', () => {
    expect(resolveCommitMessage('feat(x): add thing')).toBe(
      'feat(x): add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
  });

  it('skips the auto trailer when skipAutoTrailer is true', () => {
    expect(
      resolveCommitMessage('feat(x): add thing', { skipAutoTrailer: true }),
    ).toBe('feat(x): add thing');
  });

  it('skips the auto trailer when the message already has a Co-Authored-By trailer', () => {
    const message =
      'feat(x): add thing\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>';
    expect(resolveCommitMessage(message)).toBe(message);
  });

  it('skips the auto trailer when the message already has a Claude-Session trailer', () => {
    const message =
      'feat(x): add thing\n\nClaude-Session: https://claude.ai/code/session_abc123';
    expect(resolveCommitMessage(message)).toBe(message);
  });

  it('detects an existing trailer case-insensitively', () => {
    const message = 'feat(x): add thing\n\nco-authored-by: someone <a@b.com>';
    expect(resolveCommitMessage(message)).toBe(message);
  });

  it('does not skip when the trailer keyword appears mid-line rather than as a line prefix', () => {
    expect(
      resolveCommitMessage('feat(x): mentions Co-Authored-By in prose'),
    ).toBe(
      'feat(x): mentions Co-Authored-By in prose\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    );
  });
});
