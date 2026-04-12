import { styled } from 'tamagui';

/**
 * Type-safe wrapper around Tamagui's `styled()`.
 *
 * Tamagui's overloaded `styled()` function sometimes resolves to `any` under
 * strict TypeScript analysis, triggering no-unsafe-assignment / no-unsafe-call.
 * This function isolates the unsafe boundary so consumer call sites stay
 * lint-clean. The `unknown` return type requires callers to add an explicit
 * type assertion with their variant props, preserving type safety.
 */
export function tamaguiStyled(
  component: unknown,
  config: Record<string, unknown>,
): unknown {
  const styledFn = styled as (
    c: unknown,
    cfg: Record<string, unknown>,
  ) => unknown;
  return styledFn(component, config);
}
