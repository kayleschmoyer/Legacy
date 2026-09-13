import { describe, expect, it } from '@jest/globals';

import {
  buildStabilizeCommand,
  buildStabilizeSteps,
  shellSingleQuote,
  STABILIZE_NEXT_STEP_HINT,
} from './stabilize-steps';

const POOL_LINK_CMD = 'node scripts/modules-pool/link.mjs';

/**
 * Walk a `sh -c` payload with POSIX quoting rules and report whether it ends
 * inside an unterminated quote — precisely the state bash reports as
 * `unexpected EOF while looking for matching `''`, which is how LS-10109
 * aborted the tool before any step ran.
 *
 * A raw quote count cannot answer this: the correct escape for an apostrophe
 * inside single quotes (`'\\''`) leaves an odd number of quote characters.
 */
function endsUnterminated(command: string): boolean {
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote === null) {
      // Outside quotes, a backslash escapes the next character.
      if (char === '\\') i += 1;
      else if (char === "'" || char === '"') quote = char;
    } else if (quote === '"') {
      // Inside double quotes, a backslash still escapes.
      if (char === '\\') i += 1;
      else if (char === '"') quote = null;
    } else if (char === "'") {
      // Inside single quotes nothing escapes — only a quote closes.
      quote = null;
    }
  }

  return quote !== null;
}

describe('endsUnterminated (guard has teeth)', () => {
  it('flags the truncated payload shape LS-10109 produced', () => {
    // What bash actually received once the hint's double quotes ended the
    // argument early: the trailing `'...` opens a quote that never closes.
    expect(
      endsUnterminated(
        `echo 'Stabilization complete. Next: worktree_run(command: `,
      ),
    ).toBe(true);
  });

  it('accepts a well-formed payload', () => {
    expect(endsUnterminated(`echo 'ok' && echo "fine"`)).toBe(false);
  });
});

describe('shellSingleQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellSingleQuote('make install')).toBe("'make install'");
  });

  it('escapes an embedded apostrophe without leaving the quoting unbalanced', () => {
    const quoted = shellSingleQuote("don't abort");

    expect(quoted).toBe(`'don'\\''t abort'`);
    expect(endsUnterminated(quoted)).toBe(false);
  });

  it('leaves double quotes inert inside the single-quoted string', () => {
    expect(shellSingleQuote('worktree_run(command: "make pc")')).toBe(
      `'worktree_run(command: "make pc")'`,
    );
  });
});

describe('buildStabilizeSteps', () => {
  it('runs make install first when node_modules is a real directory', () => {
    const steps = buildStabilizeSteps(false);

    expect(steps[0]).toEqual({ label: 'make install', cmd: 'make install' });
    expect(steps.map((step) => step.cmd)).toEqual([
      'make install',
      'pnpm exec nx run db:print-schema',
      'pnpm exec nx affected -t codegen --base=origin/main',
    ]);
  });

  it('runs the modules-pool linker instead of make install when node_modules is a symlink (LS-10109)', () => {
    const steps = buildStabilizeSteps(true);

    // The symlink branch previously did nothing here, which left a rebase that
    // added a new workspace package failing typecheck with TS2307.
    expect(steps[0]).toEqual({ label: POOL_LINK_CMD, cmd: POOL_LINK_CMD });
    expect(steps.map((step) => step.cmd)).not.toContain('make install');
  });

  it('always keeps print-schema and codegen after the dependency step', () => {
    for (const isSymlink of [true, false]) {
      const cmds = buildStabilizeSteps(isSymlink).map((step) => step.cmd);

      expect(cmds).toHaveLength(3);
      expect(cmds[1]).toBe('pnpm exec nx run db:print-schema');
      expect(cmds[2]).toBe(
        'pnpm exec nx affected -t codegen --base=origin/main',
      );
    }
  });
});

describe('buildStabilizeCommand', () => {
  it('chains every step with && so the first failure short-circuits', () => {
    const command = buildStabilizeCommand(buildStabilizeSteps(false));

    expect(command).toContain('make install');
    expect(command).toContain('pnpm exec nx run db:print-schema');
    expect(command.split(' && ').length).toBeGreaterThan(3);
  });

  it('echoes a label and a success marker for each step', () => {
    const command = buildStabilizeCommand([{ label: 'demo', cmd: 'run-demo' }]);

    expect(command).toBe(
      `echo '$ demo' && run-demo && echo '✓ demo succeeded'`,
    );
  });

  it('never interpolates the prose next-step hint into the shell string (LS-10109)', () => {
    const command = buildStabilizeCommand(buildStabilizeSteps(true));

    // The hint is appended to the tool result in Node. Echoing it was what
    // aborted the tool on its own message.
    expect(command).not.toContain(STABILIZE_NEXT_STEP_HINT);
    expect(command).not.toContain('to validate');
    expect(command).not.toContain('"');
  });

  it('produces balanced single quoting even for a label containing an apostrophe', () => {
    const command = buildStabilizeCommand([
      { label: `it's a label`, cmd: 'run-it' },
    ]);

    expect(endsUnterminated(command)).toBe(false);
  });

  it('produces balanced single quoting for both branches', () => {
    for (const isSymlink of [true, false]) {
      const command = buildStabilizeCommand(buildStabilizeSteps(isSymlink));

      expect(endsUnterminated(command)).toBe(false);
    }
  });
});
