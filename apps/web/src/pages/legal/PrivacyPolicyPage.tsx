import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  Paragraph,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { styled } from 'tamagui';
import { PageMeta } from '../../components/PageMeta';

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

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <Container>
      <PageMeta
        title="Privacy Policy"
        description="Legacy Sports Privacy Policy — learn how we collect, use, and protect your personal information."
      />

      <YStack gap="$2" marginBottom="$2">
        <H1>Privacy Policy</H1>
        <Paragraph color="$gray11">Last updated: January 1, 2025</Paragraph>
      </YStack>

      <Section>
        <Paragraph color="$gray11">
          Legacy Sports ("we", "us", or "our") operates the Legacy Sports
          fantasy sports platform at legacy-fantasy.com. This Privacy Policy
          explains how we collect, use, and protect your personal information
          when you use our service.
        </Paragraph>
      </Section>

      <Section>
        <H2>Information We Collect</H2>
        <Paragraph color="$gray11">
          When you create an account, we collect your name and email address
          through your chosen OAuth provider (Google or Discord). We do not
          store your OAuth provider passwords.
        </Paragraph>
        <Paragraph color="$gray11">
          We also collect information you provide when using the platform,
          including league names, team names, draft picks, and other fantasy
          sports activity. We log usage data such as pages visited and features
          used to improve the platform.
        </Paragraph>
      </Section>

      <Section>
        <H2>How We Use Your Information</H2>
        <Paragraph color="$gray11">
          We use your information to provide and improve the Legacy Sports
          platform, send you notifications about your leagues and teams, respond
          to your support requests, and ensure the security of your account.
        </Paragraph>
        <Paragraph color="$gray11">
          We do not sell your personal information to third parties. We do not
          use your data for advertising purposes.
        </Paragraph>
      </Section>

      <Section>
        <H2>Data Storage and Security</H2>
        <Paragraph color="$gray11">
          Your data is stored securely on AWS infrastructure. We use
          industry-standard encryption for data in transit and at rest. Access
          to personal data is restricted to authorized personnel only.
        </Paragraph>
      </Section>

      <Section>
        <H2>Cookies and Tracking</H2>
        <Paragraph color="$gray11">
          We use cookies and similar technologies to maintain your session and
          remember your preferences. We may use analytics tools to understand
          how users interact with the platform in aggregate.
        </Paragraph>
      </Section>

      <Section>
        <H2>Your Rights</H2>
        <Paragraph color="$gray11">
          You may request deletion of your account and associated personal data
          at any time by contacting us. Upon deletion, your personal information
          will be removed from our systems within 30 days, except where
          retention is required by law.
        </Paragraph>
      </Section>

      <Section>
        <H2>Contact Us</H2>
        <Paragraph color="$gray11">
          If you have questions about this Privacy Policy or how we handle your
          data, please contact us at support@legacy-fantasy.com.
        </Paragraph>
      </Section>

      <YStack marginTop="$2">
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
