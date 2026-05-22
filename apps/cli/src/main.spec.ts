import { buildProgram } from './main';

type HandlerOptions = Record<string, unknown>;
type HandlerSpy = jest.Mock<void, [HandlerOptions]>;

function spyOnCommand(
  program: ReturnType<typeof buildProgram>,
  name: string,
): HandlerSpy {
  const cmd = program.commands.find((c) => c.name() === name);
  if (!cmd) {
    throw new Error(`Command ${name} not registered`);
  }
  const spy = jest.fn<void, [HandlerOptions]>();
  cmd.action((options: HandlerOptions) => {
    spy(options);
  });
  cmd.exitOverride();
  return spy;
}

function firstArg(spy: HandlerSpy): HandlerOptions {
  const call = spy.mock.calls[0];
  if (!call) {
    throw new Error('Handler was not invoked');
  }
  return call[0];
}

describe('apps/cli command option wiring (LS-2516)', () => {
  describe('add-user', () => {
    it('parses --email and --access-level into handler options', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'add-user');

      await program.parseAsync(
        ['add-user', '--email', 'jane@example.com', '--access-level', 'admin'],
        { from: 'user' },
      );

      expect(spy).toHaveBeenCalledTimes(1);
      expect(firstArg(spy)).toMatchObject({
        email: 'jane@example.com',
        accessLevel: 'admin',
      });
    });

    it('defaults --access-level to "none"', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'add-user');

      await program.parseAsync(['add-user', '--email', 'jane@example.com'], {
        from: 'user',
      });

      expect(firstArg(spy)).toMatchObject({
        email: 'jane@example.com',
        accessLevel: 'none',
      });
    });

    it('rejects invocation without --email', async () => {
      const program = buildProgram().exitOverride();
      spyOnCommand(program, 'add-user');

      await expect(
        program.parseAsync(['add-user'], { from: 'user' }),
      ).rejects.toThrow(/required option.*--email/i);
    });

    it('rejects an --access-level outside the allowed set', async () => {
      const program = buildProgram().exitOverride();
      spyOnCommand(program, 'add-user');

      await expect(
        program.parseAsync(
          [
            'add-user',
            '--email',
            'jane@example.com',
            '--access-level',
            'superuser',
          ],
          { from: 'user' },
        ),
      ).rejects.toThrow(/Access level must be 'none' or 'admin'/);
    });
  });

  describe('decode-jwt', () => {
    it('parses --token and --pretty into handler options', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'decode-jwt');

      await program.parseAsync(
        ['decode-jwt', '--token', 'abc.def.ghi', '--pretty'],
        { from: 'user' },
      );

      expect(firstArg(spy)).toMatchObject({
        token: 'abc.def.ghi',
        pretty: true,
      });
    });

    it('defaults --pretty to false', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'decode-jwt');

      await program.parseAsync(['decode-jwt', '-t', 'abc.def.ghi'], {
        from: 'user',
      });

      expect(firstArg(spy)).toMatchObject({
        token: 'abc.def.ghi',
        pretty: false,
      });
    });

    it('rejects invocation without --token', async () => {
      const program = buildProgram().exitOverride();
      spyOnCommand(program, 'decode-jwt');

      await expect(
        program.parseAsync(['decode-jwt'], { from: 'user' }),
      ).rejects.toThrow(/required option.*--token/i);
    });
  });

  describe('reset-database', () => {
    it('parses --confirm into handler options', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'reset-database');

      await program.parseAsync(['reset-database', '--confirm'], {
        from: 'user',
      });

      expect(firstArg(spy)).toMatchObject({ confirm: true });
    });

    it('defaults --confirm to false when omitted', async () => {
      const program = buildProgram().exitOverride();
      const spy = spyOnCommand(program, 'reset-database');

      await program.parseAsync(['reset-database'], { from: 'user' });

      expect(firstArg(spy)).toMatchObject({ confirm: false });
    });
  });
});
