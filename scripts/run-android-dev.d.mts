// Type declarations for the pure helpers exported by run-android-dev.mjs.
// Colocated with the same basename so TypeScript's Node16/NodeNext module
// resolution pairs it with the .mjs file automatically (the standard way to
// ship types alongside a plain JS/ESM module) — consumed by
// tools/mcp/android-server, which reuses these already-unit-tested helpers
// rather than reimplementing them (LS-8815).

export declare function splitArgs(argv: string[]): {
  checkMode: boolean;
  expoArgs: string[];
};

export declare function sdkCandidates(
  env: NodeJS.ProcessEnv,
  platform: string,
  homedir: string,
): string[];

export declare function parseOnlineDevices(adbDevicesOutput: string): string[];

export declare function parseAvdList(listAvdsOutput: string): string[];

export declare function parseLongPathsEnabled(
  regQueryOutput: string,
): number | null;

export declare function buildExpoCommand(
  appDir: string,
  extraArgs: string[],
): { file: string; args: string[] };
