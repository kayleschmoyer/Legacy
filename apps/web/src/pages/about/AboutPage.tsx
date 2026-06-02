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

const isMissing = (v: string | null | undefined): boolean =>
  v == null || v === '' || v === 'unknown' || v === 'dev';

export default function AboutPage() {
  const navigate = useNavigate();
  const isPremium = useIsPremium();
  // Read build-time environment variables from centralized config
  const { appVersion, commitSha, buildDate, repoUrl } = env;

  // Maps sentinel values to a friendly display string; raw sentinel kept for link-suppression logic below.
  const display = (v: string) => (v && v !== 'unknown' ? v : '—');

  // Generate GitHub commit URL
  const commitUrl =
    commitSha && /^[0-9a-f]{7,40}$/i.test(commitSha)
      ? `${repoUrl}/commit/${commitSha}`
      : null;

  // Format build date — guard with isMissing so 'dev'/'unknown' sentinels never
  // reach new Date(); NaN check is a safety net for any other non-parseable string.
  let formattedBuildDate = buildDate;
  if (!isMissing(buildDate)) {
    const d = new Date(buildDate);
    formattedBuildDate = Number.isNaN(d.getTime())
      ? buildDate
      : d.toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        });
  }

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
          Build, version, and deployment details for the Legacy Sports web app
        </Text>
      </YStack>

      <InfoCard>
        <H2 marginBottom="$2">Build Information</H2>

        <InfoRow data-testid="build-info-version">
          <Label>Version:</Label>
          <Value>{display(appVersion)}</Value>
        </InfoRow>

        <InfoRow data-testid="build-info-commit-sha">
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
            <Value>{display(commitSha)}</Value>
          )}
        </InfoRow>

        <InfoRow data-testid="build-info-build-date">
          <Label>Build Date:</Label>
          <Value>{display(formattedBuildDate)}</Value>
        </InfoRow>
      </InfoCard>

      <InfoCard>
        <H2 marginBottom="$2">Application Info</H2>

        <InfoRow data-testid="build-info-environment">
          <Label>Environment:</Label>
          <Value>{env.environmentName}</Value>
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
          <Button onPress={() => navigate('/pricing')} size="$4">
            Get Started Free
          </Button>
        </InfoCard>
      )}

      <YStack marginTop="$4" alignItems="center" gap="$2">
        <Text color="$gray10" fontSize="$3" textAlign="center">
          © {new Date().getUTCFullYear()} Legacy Sports
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
          Built with React, TypeScript, Tamagui, Vite, Nx, and GraphQL
        </Text>
      </YStack>
    </Container>
  );
}
