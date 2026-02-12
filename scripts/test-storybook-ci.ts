import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

type CliOptions = {
  basePort: number;
  maxPortTries: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    basePort: 6009,
    maxPortTries: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

async function canConnect(host: string, port: number): Promise<boolean> {
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
}

async function isPortAvailable(port: number): Promise<boolean> {
  const inUseV4 = await canConnect('127.0.0.1', port);
  const inUseV6 = await canConnect('::1', port);
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
  return spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  });
}

async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
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

async function runChildToCompletion(
  child: ReturnType<typeof spawnLogged>,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, '..');
  const sharedComponentsDir = path.resolve(
    workspaceRoot,
    'lib/shared-components',
  );

  const storybookBin = require.resolve('storybook/bin/index.cjs');
  const testRunnerBin = path.resolve(
    path.dirname(require.resolve('@storybook/test-runner/package.json')),
    require('@storybook/test-runner/package.json').bin['test-storybook'],
  );

  const port = await findAvailablePort(options.basePort, options.maxPortTries);
  const storybookUrl = `http://localhost:${port}`;

  const storybook = spawnLogged(
    process.execPath,
    [storybookBin, 'dev', '-p', String(port), '-c', '.storybook'],
    sharedComponentsDir,
    {
      // Coverage addon is now opt-in for stability.
      STORYBOOK_ENABLE_COVERAGE: process.env.STORYBOOK_ENABLE_COVERAGE ?? '0',
    },
  );

  try {
    await waitForHttpOk(`${storybookUrl}/iframe.html`, 60_000);

    const testRunner = spawnLogged(
      process.execPath,
      [testRunnerBin, '--url', storybookUrl],
      sharedComponentsDir,
    );

    const exitCode = await runChildToCompletion(testRunner);
    if (exitCode !== 0) {
      throw new Error(`test-storybook failed with exit code ${exitCode}`);
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
