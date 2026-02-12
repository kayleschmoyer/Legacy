import { spawn } from 'node:child_process';
import * as net from 'node:net';
import * as path from 'node:path';

type CliOptions = {
  outDir: string;
  basePort: number;
  maxPortTries: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outDir: path.resolve(process.cwd(), 'tmp/ui-previews'),
    basePort: 6009,
    maxPortTries: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--outDir' && argv[index + 1]) {
      options.outDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--basePort' && argv[index + 1]) {
      options.basePort = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--maxPortTries' && argv[index + 1]) {
      options.maxPortTries = Number(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.basePort) || options.basePort <= 0) {
    throw new Error('Invalid --basePort');
  }

  if (!Number.isFinite(options.maxPortTries) || options.maxPortTries <= 0) {
    throw new Error('Invalid --maxPortTries');
  }

  return options;
}

async function isPortAvailable(port: number): Promise<boolean> {
  const canConnect = async (host: string): Promise<boolean> => {
    return await new Promise((resolve) => {
      const socket = net.connect({ port, host });

      socket.setTimeout(200);

      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.once('error', () => {
        resolve(false);
      });
    });
  };

  const inUseV4 = await canConnect('127.0.0.1');
  const inUseV6 = await canConnect('::1');

  return !inUseV4 && !inUseV6;
}

async function findAvailablePort(
  basePort: number,
  maxPortTries: number,
): Promise<number> {
  for (let offset = 0; offset < maxPortTries; offset += 1) {
    const port = basePort + offset;
    // eslint-disable-next-line no-await-in-loop
    const ok = await isPortAvailable(port);
    if (ok) return port;
  }

  throw new Error(
    `No available port found in range ${basePort}-${basePort + maxPortTries - 1}`,
  );
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${url}`);
    }

    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore and retry
    }

    // small backoff
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
}

function spawnLogged(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true, // LS-102: Prevent console flashing on Windows
  });

  return child;
}

async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
        windowsHide: true, // LS-102: Prevent console flashing on Windows
      });
      killer.once('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`taskkill exited with code ${code}`));
      });
      killer.once('error', reject);
    });

    return;
  }

  process.kill(pid, 'SIGTERM');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sharedComponentsDir = path.resolve(
    process.cwd(),
    'lib/shared-components',
  );

  const port = await findAvailablePort(options.basePort, options.maxPortTries);
  const storybookUrl = `http://localhost:${port}`;

  // Start Storybook in a child process with an explicit port (no interactive prompts).
  const storybook = spawnLogged(
    'pnpm',
    ['exec', 'storybook', 'dev', '-p', String(port), '-c', '.storybook'],
    sharedComponentsDir,
    {
      STORYBOOK_ENABLE_COVERAGE: '0',
    },
  );

  try {
    await waitForHttpOk(`${storybookUrl}/iframe.html`, 60_000);

    const screenshot = spawnLogged(
      'pnpm',
      [
        'exec',
        'tsx',
        path.resolve(process.cwd(), 'scripts/screenshot-storybook.ts'),
        '--storybookUrl',
        storybookUrl,
        '--outDir',
        options.outDir,
      ],
      process.cwd(),
    );

    const exitCode = await new Promise<number>((resolve, reject) => {
      screenshot.once('exit', (code) => resolve(code ?? 1));
      screenshot.once('error', reject);
    });

    if (exitCode !== 0) {
      throw new Error(`Screenshot script failed with exit code ${exitCode}`);
    }
  } finally {
    if (storybook.pid) {
      try {
        await killProcessTree(storybook.pid);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
