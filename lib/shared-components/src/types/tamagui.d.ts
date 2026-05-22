/**
 * Tamagui module augmentations
 *
 * Extends type definitions for Tamagui packages to include properties used
 * across the codebase but missing from upstream types:
 *
 * - @tamagui/core    — StackStyleBase (layout, sizing, position, shorthands),
 *                      TextStylePropsBase (text alignment, font shorthands),
 *                      TamaguiCustomConfig (mono font, alt2 theme)
 * - @tamagui/stacks  — StackProps / YStackProps / XStackProps
 * - @tamagui/text    — TextProps
 * - @tamagui/select  — SelectScrollButtonProps
 * - @tamagui/separator — SeparatorProps
 */

// Extend Tamagui's core style base interfaces to include missing properties
declare module '@tamagui/core' {
  interface StackStyleBase {
    // Layout properties (keep for compatibility)
    justifyContent?: string;
    alignItems?: string;
    // Sizing properties (keep for compatibility)
    padding?: string | number;
    minWidth?: string | number;
    maxWidth?: string | number;
    marginBottom?: string | number;
    right?: string | number;
    // Position properties
    position?: string;
    top?: string | number;
    zIndex?: number;
    // Background
    backgroundColor?: string;
    // Shorthand properties that should definitely work
    jc?: string; // justifyContent shorthand
    ai?: string; // alignItems shorthand
    p?: string | number; // padding shorthand
    mb?: string | number; // marginBottom shorthand
    minW?: string | number; // minWidth shorthand
    maxW?: string | number; // maxWidth shorthand
    bg?: string; // backgroundColor shorthand
    r?: string | number; // right shorthand
    ta?: string; // textAlign shorthand
    pos?: string; // position shorthand
    t?: string | number; // top shorthand
    zi?: number; // zIndex shorthand
  }

  interface TextStylePropsBase {
    textAlign?: string;
    fontFamily?: string;
    ta?: string; // textAlign shorthand
    ff?: string; // fontFamily shorthand
  }

  // Extend custom config to properly type our additions
  interface TamaguiCustomConfig {
    fonts: {
      mono: {
        family: string;
        size: Record<string, number>;
        lineHeight: Record<string, number>;
        weight: Record<string, string>;
        letterSpacing: Record<string, number>;
      };
      [key: string]: unknown;
    };
    themes: {
      alt2: Record<string, string>;
      [key: string]: Record<string, string>;
    };
  }
}

// Extend specific Tamagui component interfaces
declare module '@tamagui/stacks' {
  interface StackProps {
    // Full properties for compatibility
    justifyContent?: string;
    alignItems?: string;
    padding?: string | number;
    minWidth?: string | number;
    maxWidth?: string | number;
    backgroundColor?: string;
    marginBottom?: string | number;
    right?: string | number;
    // Shorthand properties
    jc?: string;
    ai?: string;
    p?: string | number;
    mb?: string | number;
    minW?: string | number;
    maxW?: string | number;
    bg?: string;
    r?: string | number;
  }

  interface YStackProps extends StackProps {
    space?: string;
  }

  interface XStackProps extends StackProps {
    space?: string;
  }
}

declare module '@tamagui/text' {
  interface TextProps {
    textAlign?: string;
    fontFamily?: string;
    ta?: string;
    ff?: string;
  }
}

// Extend select component props that were missing
declare module '@tamagui/select' {
  interface SelectScrollButtonProps {
    alignItems?: string;
    justifyContent?: string;
    ai?: string;
    jc?: string;
    position?: string;
    width?: number;
    height?: string;
  }
}

// Extend separator props
declare module '@tamagui/separator' {
  interface SeparatorProps {
    marginBottom?: string | number;
    mb?: string | number;
  }
}

// Extend WebOnlyPressEvents to include keyboard events missing from @tamagui/core's
// RN type definitions. WebOnlyPressEvents → TamaguiComponentPropsBase →
// StackNonStyleProps → RNTamaguiViewNonStyleProps, so this addition flows through
// to all Stack-based components (XStack, YStack, etc.) in tsconfig.lib.json.
declare module '@tamagui/web' {
  interface WebOnlyPressEvents {
    onKeyDown?: import('react').DOMAttributes<HTMLElement>['onKeyDown'];
    onKeyUp?: import('react').DOMAttributes<HTMLElement>['onKeyUp'];
  }
}

export {};
