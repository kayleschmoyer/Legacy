import React from 'react';
import {
  ScrollView,
  Card as TamaguiCard,
  CardProps as TamaguiCardProps,
  H1 as TamaguiH1,
  H2 as TamaguiH2,
  H3 as TamaguiH3,
  Paragraph as TamaguiParagraph,
  Separator as TamaguiSeparator,
  Text as TamaguiText,
  XStack as TamaguiXStack,
  YStack as TamaguiYStack,
} from 'tamagui';

// Define our own prop types using React.ComponentProps
export type H1Props = React.ComponentProps<typeof TamaguiH1>;
export type H2Props = React.ComponentProps<typeof TamaguiH2>;
export type H3Props = React.ComponentProps<typeof TamaguiH3>;
export type ParagraphProps = React.ComponentProps<typeof TamaguiParagraph>;
export type TextProps = React.ComponentProps<typeof TamaguiText>;
export type SeparatorProps = React.ComponentProps<typeof TamaguiSeparator>;

export interface CardProps extends TamaguiCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

function Card({ title, subtitle, children, ...props }: CardProps) {
  return (
    <TamaguiCard elevate size="$4" bordered {...props}>
      {(title || subtitle) && (
        <TamaguiCard.Header padded>
          {title && <TamaguiH3>{title}</TamaguiH3>}
          {subtitle && (
            <TamaguiParagraph color="$colorPress">{subtitle}</TamaguiParagraph>
          )}
        </TamaguiCard.Header>
      )}
      <TamaguiCard.Footer padded>{children}</TamaguiCard.Footer>
    </TamaguiCard>
  );
}

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: object;
}

function ScreenContainer({ children, style }: ScreenContainerProps) {
  return (
    <ScrollView flex={1} padding="$4" {...style}>
      {children}
    </ScrollView>
  );
}

// Layout Components (using Tamagui directly)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const XStack = TamaguiXStack;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const YStack = TamaguiYStack;

// Typography Components (using Tamagui directly)
export const H1: React.FC<H1Props> = (props: H1Props) => (
  <TamaguiH1 {...props} />
);

export const H2: React.FC<H2Props> = (props: H2Props) => (
  <TamaguiH2 {...props} />
);

export const H3: React.FC<H3Props> = (props: H3Props) => (
  <TamaguiH3 {...props} />
);

export const Paragraph: React.FC<ParagraphProps> = (props: ParagraphProps) => (
  <TamaguiParagraph {...props} />
);

export const Text: React.FC<TextProps> = (props: TextProps) => (
  <TamaguiText {...props} />
);

export const Separator: React.FC<SeparatorProps> = (props: SeparatorProps) => (
  <TamaguiSeparator {...props} />
);

export { Card };
export { ScreenContainer };
