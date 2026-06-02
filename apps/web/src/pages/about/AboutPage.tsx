import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { styled, Text } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import { env } from '../../config/environment';
import { BRAND_GOLD_LIGHT } from '../../constants/colors';
import { useIsPremium } from '../../hooks/useIsPremium';

const Container = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  margin: '0 auto',
  padding: '$6',
  gap: '$4',
  $sm: {
    padding: '$3',
    gap: '$3',
  },
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
  wordBreak: 'break-all',
});

const LinkValue = styled(Text, {
  color: BRAND_GOLD_LIGHT,
  fontSize: '$4',
  fontFamily: '$mono',
  cursor: 'pointer',
  textDecorationLine: 'underline',
  hoverStyle: {
    color: BRAND_GOLD_LIGHT,
  },
});

export default function AboutPage() {
  const navigate = useNavigate();
  const isPremium = useIsPremium();
  // Read build-time environment variables from centralized config
  const { appVersion, commitSha, buildDate, repoUrl } = env;

  // Generate GitHub commit URL
  const commitUrl =
    commitSha && /^[0-9a-f]{7,40}$/i.test(commitSha)
      ? `${repoUrl}/commit/${commitSha}`
      : null;

  // Format build date
  const formattedBuildDate =
    buildDate && buildDate !== 'unknown'
      ? new Date(buildDate).toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : buildDate;

  return (
    <Container>
      <PageMeta
        title="About"
        description="Learn about Legacy Sports — the fantasy baseball league manager built for serious fans. View version, build, and deployment information."
      />
      <YStack gap="$2" marginBottom="$4">
        <H1>
          <span aria-hidden="true">ℹ️</span> About Legacy Sports
        </H1>
        <Text color="$gray11" fontSize="$5">
          Fantasy sports management platform - Version and deployment
          information
        </Text>
      </YStack>

      <InfoCard>
        <H2 marginBottom="$2">Build Information</H2>

        <InfoRow data-testid="build-info-version">
          <Label>Version:</Label>
          <Value>{appVersion}</Value>
        </InfoRow>

        <InfoRow>
          <Label>Commit SHA:</Label>
          {commitUrl ? (
            <LinkValue
              onPress={() =>
                window.open(commitUrl, '_blank', 'noopener,noreferrer')
              }
              role="link"
              aria-label={`View commit ${commitSha} on GitHub`}
            >
              {commitSha}
            </LinkValue>
          ) : (
            <Value>{commitSha}</Value>
          )}
        </InfoRow>

        <InfoRow>
          <Label>Build Date:</Label>
          <Value>{formattedBuildDate}</Value>
        </InfoRow>
      </InfoCard>

      <InfoCard>
        <H2 marginBottom="$2">Application Info</H2>

        <InfoRow data-testid="build-info-environment">
          <Label>Environment:</Label>
          <Value>{env.isDev ? 'development' : 'production'}</Value>
        </InfoRow>

        {env.isDev && (
          <InfoRow>
            <Label>GraphQL API:</Label>
            <Value>{env.graphqlUrl}</Value>
          </InfoRow>
        )}

        <InfoRow>
          <Label>Asset Base Path:</Label>
          <Value>{env.baseUrl}</Value>
        </InfoRow>
      </InfoCard>

      <InfoCard>
        <H2 marginBottom="$2">Links</H2>

        <YStack gap="$3">
          <Button
            onPress={() =>
              window.open(repoUrl, '_blank', 'noopener,noreferrer')
            }
            variant="secondary"
            size="$3"
          >
            <span role="img" aria-label="package">
              📦
            </span>{' '}
            View on GitHub
          </Button>
          {commitUrl && (
            <Button
              onPress={() =>
                window.open(commitUrl, '_blank', 'noopener,noreferrer')
              }
              variant="secondary"
              size="$3"
            >
              <span role="img" aria-label="search">
                🔍
              </span>{' '}
              View Current Commit
            </Button>
          )}
        </YStack>
      </InfoCard>

      {!isPremium && (
        <InfoCard>
          <H2 marginBottom="$2">Get Started</H2>
          <Text color="$gray11" fontSize="$4" marginBottom="$3">
            Ready to manage your fantasy sports league? Join Legacy Sports for
            free.
          </Text>
          <Button onPress={() => navigate('/')} size="$4">
            Get Started Free
          </Button>
        </InfoCard>
      )}

      <YStack marginTop="$4" alignItems="center" gap="$2">
        <Text color="$gray10" fontSize="$3" textAlign="center">
          © {new Date().getFullYear()} Legacy Sports
        </Text>
        <XStack gap="$3" alignItems="center">
          <LinkValue
            onPress={() => navigate('/privacy')}
            role="link"
            aria-label="Privacy Policy"
          >
            Privacy
          </LinkValue>
          <Text color="$gray10" fontSize="$3">
            ·
          </Text>
          <LinkValue
            onPress={() => navigate('/terms')}
            role="link"
            aria-label="Terms of Service"
          >
            Terms
          </LinkValue>
        </XStack>
        <Text color="$gray10" fontSize="$3" textAlign="center">
          Built with React, TypeScript, and Tamagui
        </Text>
      </YStack>
    </Container>
  );
}
