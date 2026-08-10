import { ALLOWED_POSITIONS_BY_SPORT } from '@legacy-sports/utils';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression test for LS-9180.
 *
 * `jest.config.mobile.ts`'s `moduleFileExtensions` previously had no
 * `native.ts`/`native.tsx` entry, so a bare `@legacy-sports/*` import in this
 * project always resolved to a package's web barrel (`index.ts`) — never the
 * native barrel Metro actually loads on-device (`index.native.ts`/
 * `mobile.ts`, per `apps/app/metro.config.js`'s `resolverMainFields`). A
 * function present in the web barrel but missing from the native one (e.g.
 * `ALLOWED_POSITIONS_BY_SPORT`, this ticket's own root cause) passed
 * `shared-components:mobile` silently and only crashed on a real device
 * (LS-8755, Rollbar #201).
 */
describe('mobile module resolution (LS-9180)', () => {
  it("jest.config.mobile.ts's moduleFileExtensions prefers native.ts/native.tsx over ts/tsx", () => {
    const configSource = fs.readFileSync(
      path.join(__dirname, '../jest.config.mobile.ts'),
      'utf8',
    );
    const match = configSource.match(/moduleFileExtensions:\s*\[([^\]]*)\]/);
    if (!match) {
      throw new Error(
        'moduleFileExtensions not found in jest.config.mobile.ts',
      );
    }
    const extensions = match[1]
      .split(',')
      .map((entry) => entry.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);

    expect(extensions.indexOf('native.ts')).toBeGreaterThanOrEqual(0);
    expect(extensions.indexOf('native.ts')).toBeLessThan(
      extensions.indexOf('ts'),
    );
  });

  it('index.native.ts still re-exports allowed-positions (ALLOWED_POSITIONS_BY_SPORT)', () => {
    const nativeBarrelSource = fs.readFileSync(
      path.join(__dirname, '../../utils/src/index.native.ts'),
      'utf8',
    );

    expect(nativeBarrelSource).toMatch(
      /export \* from '\.\/lib\/allowed-positions'/,
    );
    expect(ALLOWED_POSITIONS_BY_SPORT.football).toBeDefined();
    expect(ALLOWED_POSITIONS_BY_SPORT.baseball).toBeDefined();
  });
});
