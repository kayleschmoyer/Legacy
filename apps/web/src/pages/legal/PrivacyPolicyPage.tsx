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
          The Service may integrate with third-party authentication providers
          (such as Google or Discord). These services have their own privacy
          policies, and we encourage you to review them. We are not responsible
          for the privacy practices of third-party services.
        </BodyText>
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
