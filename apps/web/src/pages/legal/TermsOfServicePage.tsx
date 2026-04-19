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

export default function TermsOfServicePage() {
  const navigate = useNavigate();

  return (
    <Container>
      <PageMeta
        title="Terms of Service"
        description="Legacy Sports Terms of Service — the rules and guidelines for using the Legacy Sports fantasy sports platform."
      />

      <YStack gap="$2" marginBottom="$2">
        <H1>Terms of Service</H1>
        <Paragraph color="$gray11">Last updated: January 1, 2025</Paragraph>
      </YStack>

      <Section>
        <Paragraph color="$gray11">
          By accessing or using Legacy Sports at legacy-fantasy.com, you agree
          to be bound by these Terms of Service. If you do not agree, please do
          not use the platform.
        </Paragraph>
      </Section>

      <Section>
        <H2>Use of the Service</H2>
        <Paragraph color="$gray11">
          Legacy Sports is a fantasy sports platform for entertainment purposes.
          You must be at least 13 years old to create an account. You are
          responsible for maintaining the security of your account and for all
          activity that occurs under your account.
        </Paragraph>
        <Paragraph color="$gray11">
          You agree not to use the platform to harass other users, attempt to
          gain unauthorized access to any part of the service, or engage in any
          activity that disrupts or interferes with the platform.
        </Paragraph>
      </Section>

      <Section>
        <H2>Leagues and Competitions</H2>
        <Paragraph color="$gray11">
          Legacy Sports provides tools to organize and manage fantasy sports
          leagues. Commissioners have authority over their leagues, including
          rule changes and dispute resolution. Legacy Sports is not responsible
          for disputes between league members.
        </Paragraph>
        <Paragraph color="$gray11">
          Legacy Sports does not facilitate real-money wagering. Any prize
          arrangements between league members are solely between those members
          and outside the scope of this service.
        </Paragraph>
      </Section>

      <Section>
        <H2>Intellectual Property</H2>
        <Paragraph color="$gray11">
          The Legacy Sports platform, including its design, code, and content,
          is owned by Legacy Sports. Statistical data is sourced from
          third-party providers. You may not reproduce, distribute, or create
          derivative works from our platform without written permission.
        </Paragraph>
      </Section>

      <Section>
        <H2>Disclaimer of Warranties</H2>
        <Paragraph color="$gray11">
          The platform is provided "as is" without warranties of any kind. We do
          not guarantee uninterrupted access or that the service will be free of
          errors. Player statistics and projections are provided for
          entertainment and may contain inaccuracies.
        </Paragraph>
      </Section>

      <Section>
        <H2>Limitation of Liability</H2>
        <Paragraph color="$gray11">
          Legacy Sports shall not be liable for any indirect, incidental, or
          consequential damages arising from your use of the platform. Our total
          liability to you for any claims shall not exceed the amount you have
          paid to us in the preceding 12 months.
        </Paragraph>
      </Section>

      <Section>
        <H2>Changes to These Terms</H2>
        <Paragraph color="$gray11">
          We may update these Terms of Service from time to time. Continued use
          of the platform after changes take effect constitutes acceptance of
          the updated terms. We will notify you of significant changes via
          email.
        </Paragraph>
      </Section>

      <Section>
        <H2>Contact Us</H2>
        <Paragraph color="$gray11">
          If you have questions about these Terms of Service, please contact us
          at support@legacy-fantasy.com.
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
