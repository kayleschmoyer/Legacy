import { describe, expect, it } from '@jest/globals';

import { errorResult } from './aws-error.js';

function unwrap(result: ReturnType<typeof errorResult>) {
  return JSON.parse(result.content[0].text) as {
    ok: false;
    error: string;
    remedy?: string;
  };
}

describe('errorResult', () => {
  it('attaches the SSO remedy for an expired-session message', () => {
    const body = unwrap(errorResult('Failed', 'sso session has expired'));
    expect(body.remedy).toMatch(/aws sso login/);
  });

  it('attaches the CLI-not-found remedy for the rewritten runCommand ENOENT message (LS-9537)', () => {
    const body = unwrap(
      errorResult(
        'Failed',
        'aws CLI not found (spawn aws ENOENT): the "aws" binary is not installed or not on PATH in this environment.',
      ),
    );
    expect(body.remedy).toMatch(/Claude Code Remote/);
  });

  it('leaves remedy undefined for an unrelated error', () => {
    const body = unwrap(errorResult('Failed', 'access denied'));
    expect(body.remedy).toBeUndefined();
  });
});
