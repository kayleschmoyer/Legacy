import type { ButtonProps } from '../types/ui';

export type ButtonVariant = NonNullable<ButtonProps['variant']>;

export type ButtonVariantStyle = {
  tamaguiVariant: 'outlined' | undefined;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  color: string;
  textDecorationLine?: 'underline' | 'none';
};

const NAVY = '#1B3A5C';
const NAVY_TEXT = '#F5F1E6';
const GOLD = '#C5A55A';
const TRANSPARENT = 'transparent';

export const VARIANT_STYLES: Record<ButtonVariant, ButtonVariantStyle> = {
  primary: {
    tamaguiVariant: undefined,
    backgroundColor: NAVY,
    borderColor: NAVY,
    borderWidth: 1,
    color: NAVY_TEXT,
  },
  secondary: {
    tamaguiVariant: undefined,
    backgroundColor: TRANSPARENT,
    borderColor: NAVY,
    borderWidth: 1,
    color: NAVY,
  },
  outline: {
    tamaguiVariant: 'outlined',
    backgroundColor: TRANSPARENT,
    borderColor: GOLD,
    borderWidth: 1,
    color: GOLD,
  },
  ghost: {
    tamaguiVariant: undefined,
    backgroundColor: TRANSPARENT,
    borderColor: TRANSPARENT,
    borderWidth: 0,
    color: NAVY,
  },
  link: {
    tamaguiVariant: undefined,
    backgroundColor: TRANSPARENT,
    borderColor: TRANSPARENT,
    borderWidth: 0,
    color: NAVY,
    textDecorationLine: 'underline',
  },
};
