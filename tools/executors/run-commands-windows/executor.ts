import { ExecutorContext } from '@nx/devkit';
import { spawn } from 'node:child_process';
import { RunCommandsOptions } from './schema';

export default async function runExecutor(
  options: RunCommandsOptions,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const {
    command,
    commands,
    cwd,
    env,
    parallel = false,
    color = false,
    __unparsed__ = [],
  } = options;

  try {
    // Handle single command
    if (command) {
      const success = await executeCommand(
        command,
        cwd || context.root,
        env,
        color,
      );
      return { success };
    }

    // Handle multiple commands
    if (commands && commands.length > 0) {
      if (parallel) {
        const results = await Promise.all(
          commands.map((cmd) =>
            executeCommand(cmd, cwd || context.root, env, color),
          ),
        );
        return { success: results.every((r) => r) };
      } else {
        for (const cmd of commands) {
          const success = await executeCommand(
            cmd,
            cwd || context.root,
            env,
            color,
          );
          if (!success) {
            return { success: false };
          }
        }
        return { success: true };
      }
    }

    throw new Error('Either "command" or "commands" must be provided');
  } catch (error) {
    console.error('Executor error:', error);
    return { success: false };
  }
}

async function executeCommand(
  command: string,
  cwd: string,
  env?: Record<string, string>,
  color?: boolean,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, {
      cwd,
      env: {
        ...process.env,
        ...(env || {}),
        ...(color ? { FORCE_COLOR: '1' } : {}),
      },
      stdio: 'inherit',
      shell: true,
      windowsHide: true, // LS-102: Prevent console flashing on Windows
    });

    child.on('exit', (code) => {
      resolve(code === 0);
    });

    child.on('error', (error) => {
      console.error(`Failed to execute command: ${command}`, error);
      resolve(false);
    });
  });
}
