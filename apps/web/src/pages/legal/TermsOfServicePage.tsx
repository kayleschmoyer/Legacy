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

export default function TermsOfServicePage() {
  const navigate = useNavigate();

  return (
    <Container>
      <PageMeta
        title="Terms of Service"
        description="Legacy Sports Terms of Service — read our terms before using the platform."
      />

      <YStack gap="$2" marginBottom="$2">
        <H1>Terms of Service</H1>
        <Text color="$gray11" fontSize="$4">
          Last updated: January 1, 2025
        </Text>
      </YStack>

      <Section>
        <SectionTitle>1. Acceptance of Terms</SectionTitle>
        <BodyText>
          By accessing or using Legacy Sports ("the Service"), you agree to be
          bound by these Terms of Service. If you do not agree to these terms,
          please do not use the Service.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>2. Description of Service</SectionTitle>
        <BodyText>
          Legacy Sports is a fantasy sports management platform that allows
          users to create and participate in fantasy baseball and football
          leagues. The Service includes league management tools, draft boards,
          player statistics, and related features.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>3. User Accounts</SectionTitle>
        <BodyText>
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activities that occur under your
          account. You must notify us immediately of any unauthorized use of
          your account. We reserve the right to terminate accounts that violate
          these terms.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>4. Acceptable Use</SectionTitle>
        <BodyText>
          You agree not to use the Service to: (a) violate any applicable laws
          or regulations; (b) harass, abuse, or harm other users; (c) transmit
          spam or unsolicited communications; (d) attempt to gain unauthorized
          access to any part of the Service; or (e) engage in any activity that
          disrupts or interferes with the Service.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>5. Intellectual Property</SectionTitle>
        <BodyText>
          The Service and its original content, features, and functionality are
          owned by Legacy Sports and are protected by applicable intellectual
          property laws. You may not reproduce, distribute, or create derivative
          works without our express written permission.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>6. Disclaimer of Warranties</SectionTitle>
        <BodyText>
          The Service is provided on an "as is" and "as available" basis without
          warranties of any kind. We do not warrant that the Service will be
          uninterrupted, error-free, or free of harmful components.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>7. Limitation of Liability</SectionTitle>
        <BodyText>
          To the maximum extent permitted by law, Legacy Sports shall not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages arising from your use of or inability to use the
          Service.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>8. Changes to Terms</SectionTitle>
        <BodyText>
          We reserve the right to modify these terms at any time. We will notify
          users of material changes by updating the "Last updated" date.
          Continued use of the Service after changes constitutes acceptance of
          the revised terms.
        </BodyText>
      </Section>

      <Section>
        <SectionTitle>9. Contact</SectionTitle>
        <BodyText>
          If you have questions about these Terms of Service, please contact us
          through the Help page or submit a bug report.
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
