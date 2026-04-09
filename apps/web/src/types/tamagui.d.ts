// Tamagui type augmentations for web project
// Copied from shared-components to ensure availability

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
    // Overflow (Tamagui restricts to RN values; add web values here)
    overflow?: string;
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
}
