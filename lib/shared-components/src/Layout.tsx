import React from 'react';
import {
  Card as TamaguiCard,
  CardProps as TamaguiCardProps,
  H1 as TamaguiH1,
  H1Props,
  H2 as TamaguiH2,
  H2Props,
  H3 as TamaguiH3,
  H3Props,
  Paragraph as TamaguiParagraph,
  ParagraphProps,
  ScrollView,
  CardProps as TamaguiCardProps,
  View,
} from 'tamagui';

// Define our own prop types since not all are exported
export interface H1Props {
  children?: React.ReactNode;
  [key: string]: any;
}

export interface H2Props {
  children?: React.ReactNode;
  [key: string]: any;
}

export interface H3Props {
  children?: React.ReactNode;
  [key: string]: any;
}

export interface ParagraphProps {
  children?: React.ReactNode;
  [key: string]: any;
}

export interface SeparatorProps {
  [key: string]: any;
}

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
export const XStack = TamaguiXStack;
export const YStack = TamaguiYStack;

// Typography Components (using Tamagui directly)
export const H1: React.FC<H1Props> = (props) => <TamaguiH1 {...props} />;

export const H2: React.FC<H2Props> = (props) => <TamaguiH2 {...props} />;

export const H3: React.FC<H3Props> = (props) => <TamaguiH3 {...props} />;

export const Paragraph: React.FC<ParagraphProps> = (props) => (
  <TamaguiParagraph {...props} />
);

export const Separator: React.FC<SeparatorProps> = (props) => (
  <TamaguiSeparator {...props} />
);

export { Card };
export { ScreenContainer };
