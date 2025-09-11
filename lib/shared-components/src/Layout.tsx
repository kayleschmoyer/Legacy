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
  Separator as TamaguiSeparator,
  SeparatorProps,
  XStack as TamaguiXStack,
  XStackProps,
  YStack as TamaguiYStack,
  YStackProps,
} from 'tamagui';

export interface CardProps extends TamaguiCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  children,
  ...props
}) => {
  return (
    <TamaguiCard elevate size="$4" bordered {...props}>
      {(title || subtitle) && (
        <TamaguiCard.Header padded>
          {title && <TamaguiH3>{title}</TamaguiH3>}
          {subtitle && (
            <TamaguiParagraph theme="alt2">{subtitle}</TamaguiParagraph>
          )}
        </TamaguiCard.Header>
      )}
      <TamaguiCard.Footer padded>{children}</TamaguiCard.Footer>
    </TamaguiCard>
  );
};

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: object;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  style,
}) => {
  return (
    <ScrollView flex={1} padding="$4" {...style}>
      {children}
    </ScrollView>
  );
};

// Layout Components (using Tamagui directly)
export const XStack: React.FC<XStackProps> = (props) => (
  <TamaguiXStack space="$2" {...props} />
);

export const YStack: React.FC<YStackProps> = (props) => (
  <TamaguiYStack space="$2" {...props} />
);

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
