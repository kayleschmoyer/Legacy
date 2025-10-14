import React from 'react';
import { H1, H3, XStack, YStack } from '@legacy-sports/shared-components';
import { styled, Text } from 'tamagui';
import { env } from '../config/environment';

const Container = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  margin: '0 auto',
  padding: '$6',
  gap: '$4',
});

const InfoCard = styled(YStack, {
  backgroundColor: '$background',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$4',
  padding: '$5',
  gap: '$3',
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
});

const InfoRow = styled(XStack, {
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '$4',
  flexWrap: 'wrap',
});

const Label = styled(Text, {
  fontWeight: 'bold',
  color: '$color',
  fontSize: '$4',
});

const Value = styled(Text, {
  color: '$gray11',
  fontSize: '$4',
  fontFamily: '$mono',
});

export default function AboutPage() {
  // Read build-time environment variables from centralized config
  const { appVersion, commitSha, buildDate } = env;

  return (
    <Container>
      <YStack gap="$2" marginBottom="$4">
        <H1>
          <span role="img" aria-label="info">
            ℹ️
          </span>{' '}
          About Legacy Sports
        </H1>
        <Text color="$gray11" fontSize="$5">
          Version and deployment information
        </Text>
      </YStack>

      <InfoCard>
        <H3 marginBottom="$2">Build Information</H3>

        <InfoRow>
          <Label>Version:</Label>
          <Value>{appVersion}</Value>
        </InfoRow>

        <InfoRow>
          <Label>Commit SHA:</Label>
          <Value>{commitSha}</Value>
        </InfoRow>

        <InfoRow>
          <Label>Build Date:</Label>
          <Value>{buildDate}</Value>
        </InfoRow>
      </InfoCard>

      <InfoCard>
        <H3 marginBottom="$2">Application Info</H3>

        <InfoRow>
          <Label>Environment:</Label>
          <Value>{env.isDev ? 'development' : 'production'}</Value>
        </InfoRow>

        <InfoRow>
          <Label>Base URL:</Label>
          <Value>{env.baseUrl}</Value>
        </InfoRow>
      </InfoCard>
    </Container>
  );
}
