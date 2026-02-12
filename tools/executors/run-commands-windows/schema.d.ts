export interface RunCommandsOptions {
  /**
   * Command to run in the terminal
   */
  command?: string;

  /**
   * Array of commands to run (alternative to single command)
   */
  commands?: string[];

  /**
   * Current working directory for the command
   */
  cwd?: string;

  /**
   * Environment variables to set
   */
  env?: Record<string, string>;

  /**
   * Run commands in parallel (when using commands array)
   */
  parallel?: boolean;

  /**
   * Use colors in output
   */
  color?: boolean;

  /**
   * Unparsed command line arguments
   */
  __unparsed__?: string[];
}
