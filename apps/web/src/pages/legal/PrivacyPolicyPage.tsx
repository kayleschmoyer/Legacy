import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  Paragraph,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { styled, Text } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import { BRAND_GOLD } from '../../constants/colors';

const Container = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  margin: '0 auto',
  padding: '$6',
  gap: '$5',
  $sm: {
    padding: '$3',
    gap: '$4',
  },
});

const Section = styled(YStack, {
  gap: '$3',
});

const SectionTitle = styled(H2, {
  color: BRAND_GOLD,
  fontSize: '$6',
});

const BodyText = styled(Paragraph, {
  color: '$gray11',
  fontSize: '$4',
  lineHeight: 24,
});

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  fontWeight: 600,
  textAlign: 'left',
  padding: '8px 12px 8px 0',
  borderBottom: '2px solid #333',
  color: '#e5e5e5',
};

const tdStyle: React.CSSProperties = {
  color: '#a3a3a3',
  padding: '8px 12px 8px 0',
  borderBottom: '1px solid #333',
  verticalAlign: 'top',
  lineHeight: '20px',
};

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <Container>
      <PageMeta
        title="Privacy Policy"
        description="Legacy Sports Privacy Policy — learn how we collect, use, and protect your data."
      />

      <YStack gap="$2" marginBottom="$2">
        <H1>Privacy Policy</H1>
        <Text color="$gray11" fontSize="$4">
          Last updated: January 1, 2025
        </Text>
      </YStack>

      <Section>
        <SectionTitle>1. Information We Collect</SectionTitle>
        <BodyText>
          We collect information you provide directly to us, such as your name,
          email address, and account credentials when you register. We also
          collect usage data, including pages visited, features used, and
          interactions with the Service.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>2. How We Use Your Information</SectionTitle>
        <BodyText>
          We use the information we collect to: (a) provide and improve the
          Service; (b) communicate with you about your account and updates; (c)
          personalize your experience; (d) monitor and analyze usage patterns;
          and (e) comply with legal obligations.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>3. Information Sharing</SectionTitle>
        <BodyText>
          We do not sell, trade, or rent your personal information to third
          parties. We may share aggregated, non-personally identifiable
          information publicly or with partners. We may disclose personal
          information when required by law or to protect our rights.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>4. Data Security</SectionTitle>
        <BodyText>
          We implement industry-standard security measures to protect your
          personal information. However, no method of transmission over the
          Internet or electronic storage is 100% secure. We cannot guarantee
          absolute security of your data.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>5. Cookies and Tracking</SectionTitle>
        <BodyText>
          We use cookies and similar tracking technologies to enhance your
          experience, analyze usage, and remember your preferences. You can
          control cookie settings through your browser, though disabling cookies
          may affect Service functionality.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>6. Third-Party Services</SectionTitle>
        <BodyText>
          We share data with the following third-party processors to operate the
          Service. Each processor is bound by its own privacy policy; we
          encourage you to review them. We are not responsible for the privacy
          practices of third-party services.
        </BodyText>

        <table style={tableStyle}>
          <thead>
            <tr>
              <th scope="col" style={thStyle}>
                Service
              </th>
              <th scope="col" style={thStyle}>
                Purpose
              </th>
              <th scope="col" style={thStyle}>
                Data Shared
              </th>
              <th scope="col" style={thStyle}>
                Privacy Policy
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>Google</td>
              <td style={tdStyle}>Authentication (Sign in with Google)</td>
              <td style={tdStyle}>Email address, name, profile picture</td>
              <td style={tdStyle}>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  policies.google.com/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Discord</td>
              <td style={tdStyle}>Authentication (Sign in with Discord)</td>
              <td style={tdStyle}>Discord username, email address</td>
              <td style={tdStyle}>
                <a
                  href="https://discord.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  discord.com/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Stripe</td>
              <td style={tdStyle}>
                Payment processing and subscription billing
              </td>
              <td style={tdStyle}>
                Name, email address, payment card details, billing address
              </td>
              <td style={tdStyle}>
                <a
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  stripe.com/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Rollbar</td>
              <td style={tdStyle}>Error monitoring and crash reporting</td>
              <td style={tdStyle}>
                Stack traces, device info, may include user identifiers in error
                context
              </td>
              <td style={tdStyle}>
                <a
                  href="https://rollbar.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  rollbar.com/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Expo (expo-notifications)</td>
              <td style={tdStyle}>Push notification delivery</td>
              <td style={tdStyle}>Device push token</td>
              <td style={tdStyle}>
                <a
                  href="https://expo.dev/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  expo.dev/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Apple (App Store / IAP)</td>
              <td style={tdStyle}>In-app purchase processing (iOS)</td>
              <td style={tdStyle}>Purchase receipts, Apple customer ID</td>
              <td style={tdStyle}>
                <a
                  href="https://www.apple.com/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  apple.com/legal/privacy
                </a>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>Google (Google Play Billing)</td>
              <td style={tdStyle}>In-app purchase processing (Android)</td>
              <td style={tdStyle}>Purchase receipts, Google customer ID</td>
              <td style={tdStyle}>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD }}
                >
                  policies.google.com/privacy
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section>
        <SectionTitle>7. Data Retention</SectionTitle>
        <BodyText>
          We retain your personal information for as long as your account is
          active or as needed to provide the Service. You may request deletion
          of your account and associated data by contacting us through the Help
          page.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>8. Children's Privacy</SectionTitle>
        <BodyText>
          The Service is not directed to children under the age of 13. We do not
          knowingly collect personal information from children under 13. If we
          become aware that we have collected such information, we will take
          steps to delete it.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>9. Changes to This Policy</SectionTitle>
        <BodyText>
          We may update this Privacy Policy from time to time. We will notify
          you of significant changes by updating the "Last updated" date.
          Continued use of the Service after changes constitutes acceptance of
          the revised policy.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>10. Contact</SectionTitle>
        <BodyText>
          If you have questions about this Privacy Policy or your personal data,
          please contact us through the Help page or submit a bug report.
        </BodyText>
      </Section>

      <YStack gap="$3" marginTop="$2">
        <Button
          onPress={() => navigate(-1)}
          variant="secondary"
          size="$3"
          alignSelf="flex-start"
        >
          ← Back
        </Button>
      </YStack>
    </Container>
  );
}
