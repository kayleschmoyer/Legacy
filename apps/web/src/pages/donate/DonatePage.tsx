import React from 'react';
import { Paragraph, XStack, YStack } from '@legacy-sports/shared-components/ui';
import { Button, ScrollView, styled } from 'tamagui';
import { Heart } from '@tamagui/lucide-icons';
import { Link, useSearchParams } from 'react-router-dom';
import { PageMeta } from '../../components/PageMeta';
import { useGetDonationPaymentLinkQuery } from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_GOLD_PRESS,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  withAlpha,
} from '../../constants/colors';

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 640,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$6',
  paddingTop: '$10',
  $sm: { paddingHorizontal: '$3', paddingTop: '$6', gap: '$4' },
});

const DonateCard = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
});

const CardBody = styled(YStack, {
  padding: '$6',
  gap: '$5',
  $sm: { padding: '$4' },
});

const CtaButton = styled(Button, {
  borderRadius: '$5',
  size: '$5',
  fontWeight: '600',
  pressStyle: { scale: 0.98 },
  hoverStyle: { opacity: 0.9 },
});

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 20% 0%, ${withAlpha(BRAND_NAVY, 0.18)} 0%, transparent 55%),
    radial-gradient(ellipse at 80% 5%, ${withAlpha(BRAND_GOLD, 0.07)} 0%, transparent 50%)
  `,
  backgroundAttachment: 'fixed',
};

const cardStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${withAlpha(BRAND_GOLD, 0.07)} 0%, ${withAlpha(BRAND_GOLD_PRESS, 0.03)} 100%)`,
  backgroundColor: BG_DARK,
  borderColor: withAlpha(BRAND_GOLD, 0.25),
};

const DonatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { data, loading, error } = useGetDonationPaymentLinkQuery();

  const donationUrl = data?.donationPaymentLink?.url ?? null;
  const checkoutStatus = searchParams.get('checkout');
  const hasDonationError = !loading && (error != null || donationUrl == null);

  const handleDonate = () => {
    if (!donationUrl) return;
    window.location.href = donationUrl;
  };

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Donate"
        description="Support Legacy Sports with a one-time donation."
      />
      <ScrollView>
        <ContentContainer>
          {/* Header */}
          <YStack gap="$2" alignItems="center" textAlign="center">
            <XStack
              width={56}
              height={56}
              borderRadius={28}
              alignItems="center"
              justifyContent="center"
              style={
                {
                  background: `linear-gradient(135deg, ${withAlpha(BRAND_GOLD, 0.18)} 0%, ${withAlpha(BRAND_GOLD_PRESS, 0.1)} 100%)`,
                  border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
                } as React.CSSProperties
              }
            >
              <Heart size={26} color={BRAND_GOLD} />
            </XStack>
            <Paragraph
              style={
                {
                  fontSize: 32,
                  fontWeight: '700',
                  color: BRAND_GOLD_LIGHT,
                  letterSpacing: -0.5,
                  fontFamily: "'Big Shoulders Display', system-ui, sans-serif",
                } as React.CSSProperties
              }
            >
              Support Legacy Sports
            </Paragraph>
            <Paragraph size="$4" color="$colorPress" textAlign="center">
              Legacy Sports is built with passion for fantasy sports fans. Your
              donation helps keep the platform independent, ad-free, and always
              improving.
            </Paragraph>
          </YStack>

          {/* Success banner */}
          {checkoutStatus === 'success' && (
            <DonateCard
              style={
                {
                  backgroundColor: withAlpha(BRAND_GOLD, 0.08),
                  borderColor: withAlpha(BRAND_GOLD, 0.35),
                } as React.CSSProperties
              }
            >
              <XStack padding="$4" gap="$3" alignItems="center">
                <Heart size={20} color={BRAND_GOLD} flexShrink={0} />
                <YStack flex={1} gap="$1">
                  <Paragraph
                    size="$4"
                    fontWeight="600"
                    style={{ color: BRAND_GOLD_LIGHT } as React.CSSProperties}
                  >
                    Thank you for your support!
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    Your donation means the world to us. Every contribution
                    helps keep Legacy Sports running.
                  </Paragraph>
                </YStack>
              </XStack>
            </DonateCard>
          )}

          {/* Donate card */}
          {checkoutStatus !== 'success' && (
            <DonateCard style={cardStyle}>
              <CardBody>
                <YStack gap="$3">
                  <Paragraph size="$4" color="$color" fontWeight="600">
                    One-time donation
                  </Paragraph>
                  <Paragraph size="$3" color="$colorPress">
                    Choose your own amount. Payments are processed securely
                    through Stripe — we never handle your payment details
                    directly.
                  </Paragraph>
                </YStack>

                <YStack gap="$3">
                  <Paragraph size="$2" color="$colorPress">
                    What your donation supports:
                  </Paragraph>
                  {[
                    'Server infrastructure and hosting costs',
                    'New features and platform improvements',
                    'Data feeds and sports statistics',
                    'Keeping the app ad-free',
                  ].map((item) => (
                    <XStack key={item} alignItems="center" gap="$2">
                      <YStack
                        width={6}
                        height={6}
                        borderRadius={3}
                        backgroundColor={BRAND_GOLD}
                        flexShrink={0}
                      />
                      <Paragraph size="$3" color="$colorPress">
                        {item}
                      </Paragraph>
                    </XStack>
                  ))}
                </YStack>

                {hasDonationError && (
                  <YStack
                    padding="$3"
                    borderRadius="$4"
                    borderWidth={1}
                    style={
                      {
                        backgroundColor: withAlpha(BRAND_SEAM_RED, 0.1),
                        borderColor: withAlpha(BRAND_SEAM_RED, 0.35),
                      } as React.CSSProperties
                    }
                  >
                    <Paragraph
                      size="$3"
                      style={
                        { color: BRAND_SEAM_RED_LIGHT } as React.CSSProperties
                      }
                    >
                      Could not load donation link — please try again later.
                    </Paragraph>
                  </YStack>
                )}

                <CtaButton
                  onPress={handleDonate}
                  disabled={loading || !donationUrl}
                  icon={<Heart size={18} />}
                  style={
                    {
                      background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_PRESS} 100%)`,
                      color: BG_DARK,
                      fontWeight: '700',
                      fontSize: 16,
                      opacity: loading || !donationUrl ? 0.5 : 1,
                    } as React.CSSProperties
                  }
                >
                  {loading ? 'Loading…' : 'Donate via Stripe'}
                </CtaButton>

                <Paragraph size="$2" color="$colorPress" textAlign="center">
                  Secure payment via Stripe. No account required.
                </Paragraph>
              </CardBody>
            </DonateCard>
          )}

          {/* Already donated / return */}
          <YStack alignItems="center">
            <Paragraph size="$2" color="$colorPress" textAlign="center">
              Want to support ongoing access?{' '}
              <Link
                to="/profile/subscription"
                style={{
                  color: BRAND_NAVY_LIGHT,
                  textDecoration: 'underline',
                }}
              >
                View Premium plans
              </Link>
            </Paragraph>
          </YStack>
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

export default DonatePage;
