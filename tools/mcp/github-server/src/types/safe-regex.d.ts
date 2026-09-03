// safe-regex has no published types. It's a package.json dependency (used by
// list-prs.ts to reject catastrophic-backtracking-prone `paths` patterns
// before compiling them), so this just gives tsc a shape to resolve against.
declare module 'safe-regex' {
  function safe(pattern: string | RegExp, opts?: { limit?: number }): boolean;
  export default safe;
}
