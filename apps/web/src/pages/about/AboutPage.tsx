import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { styled, Text } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import { env, envConfigErrors } from '../../config/environment';
import { BRAND_GOLD_LIGHT, BRAND_SEAM_RED } from '../../constants/colors';
import { useIsPremium } from '../../hooks/useIsPremium';
import { trackEvent } from '../../utils/analytics';

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
  const { isAuthenticated } = useAuth();
  const isPremium = useIsPremium();
  // Read build-time environment variables from centralized config
  const { appVersion, commitSha, buildDate, repoUrl } = env;

  // Maps sentinel values to a friendly display string; raw sentinel kept for link-suppression logic below.
  const display = (v: string) =>
    v && v !== 'unknown' && v !== 'dev' ? v : '—';

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

      {envConfigErrors.length > 0 && (
        <InfoCard
          data-testid="config-health-warning"
          borderColor={BRAND_SEAM_RED}
        >
          <H2 marginBottom="$2" color={BRAND_SEAM_RED}>
            Configuration Error
          </H2>
          <Text color="$color" fontSize="$4" marginBottom="$2">
            This build is missing required environment variables. OAuth and
            GraphQL will not function correctly. Check CI/CD configuration for:
          </Text>
          {envConfigErrors.map((key) => (
            <InfoRow key={key}>
              <Value fontFamily="$mono">{key}</Value>
            </InfoRow>
          ))}
        </InfoCard>
      )}

      <InfoCard>
        <H2 marginBottom="$2">Links</H2>

        <YStack gap="$3">
          <Button
            onPress={() => {
              trackEvent('about_github_click', { category: 'about' });
              window.open(repoUrl, '_blank', 'noopener,noreferrer');
            }}
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
              onPress={() => {
                trackEvent('about_commit_click', { category: 'about' });
                window.open(commitUrl, '_blank', 'noopener,noreferrer');
              }}
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

      <InfoCard>
        <H2 marginBottom="$2">Get Started</H2>
        {isAuthenticated ? (
          <>
            <Text color="$gray11" fontSize="$4" marginBottom="$3">
              Welcome back! Head to your dashboard to manage your leagues.
            </Text>
            <YStack gap="$3">
              <Button onPress={() => navigate('/home')} size="$4">
                Go to Dashboard
              </Button>
              {!isPremium && (
                <Button
                  onPress={() => navigate('/pricing')}
                  variant="secondary"
                  size="$4"
                >
                  Upgrade to Premium
                </Button>
              )}
            </YStack>
          </>
        ) : (
          <>
            <Text color="$gray11" fontSize="$4" marginBottom="$3">
              Ready to manage your fantasy sports league? Join Legacy Sports for
              free.
            </Text>
            <Button onPress={() => navigate('/')} size="$4">
              Get Started Free
            </Button>
          </>
        )}
      </InfoCard>

      <YStack marginTop="$4" alignItems="center" gap="$2">
        <Text
          color="$gray10"
          fontSize="$3"
          textAlign="center"
          data-testid="footer-copyright"
        >
          © {new Date().getUTCFullYear()} Legacy Sports
        </Text>
        <Text
          color="$gray10"
          fontSize="$3"
          textAlign="center"
          data-testid="footer-attribution"
        >
          Built with React, TypeScript, and Tamagui
        </Text>
      </YStack>
    </Container>
  );
}
