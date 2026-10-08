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
import { CookieSettingsButton } from '../../consent/ConsentManager';
import { BRAND_GOLD } from '../../constants/colors';
import { useThemeContext } from '../../context/ThemeContext';

const Container = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  margin: '0 auto',
  padding: '$6',
  gap: '$5',
  // Keyed to `$xs` (≤799), not `$sm` (≤859): this compaction is tuned to
  // "the container has stopped having viewport slack", and the cap above is
  // 800. LS-9898 widened `$sm` to 859, which would apply phone padding
  // while the container still renders at its full width (LS-9885 audit).
  $xs: {
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

/**
 * Horizontal scroll region for the processors table (LS-10763). The table is
 * wider than a phone viewport and the app shell clips x-overflow, so the table
 * scrolls inside its own region instead. It is focusable so keyboard users can
 * scroll it with the arrow keys.
 */
const tableScrollStyle: React.CSSProperties = {
  overflowX: 'auto',
  width: '100%',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  // Keeps the four columns readable on phones; the region above scrolls.
  minWidth: 640,
  borderCollapse: 'collapse',
  fontSize: 13,
};

/**
 * Table colours per theme (LS-10730). Dark keeps its original raw values so
 * the dark table is unchanged; light reads the Tamagui theme CSS variables so
 * the text stays readable on the light page.
 */
const TABLE_PALETTE = {
  dark: {
    heading: '#e5e5e5',
    cell: '#a3a3a3',
    headingBorder: '2px solid #333',
    rowBorder: '1px solid #333',
    link: BRAND_GOLD,
  },
  light: {
    heading: 'var(--color12)',
    cell: 'var(--color11)',
    headingBorder: '2px solid var(--borderColor)',
    rowBorder: '1px solid var(--outlineSubtle)',
    link: 'var(--goldText)',
  },
} as const;

type TablePalette = (typeof TABLE_PALETTE)[keyof typeof TABLE_PALETTE];

function tableCellStyles(palette: TablePalette) {
  const th: React.CSSProperties = {
    fontWeight: 600,
    textAlign: 'left',
    padding: '8px 12px 8px 0',
    borderBottom: palette.headingBorder,
    color: palette.heading,
  };
  const td: React.CSSProperties = {
    color: palette.cell,
    padding: '8px 12px 8px 0',
    borderBottom: palette.rowBorder,
    verticalAlign: 'top',
    lineHeight: '20px',
  };
  const link: React.CSSProperties = { color: palette.link };
  return { th, td, link };
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const { resolvedTheme } = useThemeContext();
  const {
    th: thStyle,
    td: tdStyle,
    link: linkStyle,
  } = tableCellStyles(TABLE_PALETTE[resolvedTheme]);

  return (
    <Container>
      <PageMeta
        title="Privacy Policy"
        description="Legacy Sports Privacy Policy — learn how we collect, use, and protect your data."
      />

      <YStack gap="$2" marginBottom="$2">
        <H1>Privacy Policy</H1>
        <Text color="$gray11" fontSize="$4">
          Last updated: October 6, 2026
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
          We use cookies and similar browser storage (such as local storage) in
          two categories:
        </BodyText>
        <BodyText>
          <Text fontWeight="700">Strictly necessary.</Text> These keep you
          signed in, secure your account, remember your settings (such as your
          theme) and remember your cookie choice. They also store the feature
          settings GrowthBook needs to show you the right version of the
          Service. They are always on because the Service does not work without
          them.
        </BodyText>
        <BodyText>
          <Text fontWeight="700">Analytics.</Text> With your permission, we use
          Google Analytics 4 to understand which pages and features are used, so
          we can improve the Service. Google Analytics sets first-party cookies
          (named _ga and _ga_&lt;ID&gt;) that hold a pseudonymous identifier. If
          you are in the European Economic Area, the United Kingdom or
          Switzerland, analytics is off until you choose to allow it. Elsewhere,
          analytics is on by default and you can turn it off at any time. If you
          turn it off, we stop sending analytics data and delete the Google
          Analytics cookies from your browser.
        </BodyText>
        <BodyText>
          We do not use advertising cookies, and we do not sell your data or
          share it for targeted advertising.
        </BodyText>
        <BodyText>
          You can change your choice at any time with the Cookie settings link
          at the bottom of our public pages, on your Preferences page, or here:{' '}
          <CookieSettingsButton style={{ color: BRAND_GOLD }}>
            Change your cookie settings
          </CookieSettingsButton>
          . We remember your choice for 12 months, then ask again. Your browser
          settings can also block or delete cookies, though blocking strictly
          necessary cookies may stop the Service from working.
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

        <div
          role="region"
          aria-label="Third-party services"
          tabIndex={0}
          style={tableScrollStyle}
        >
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
                    style={linkStyle}
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
                    style={linkStyle}
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
                    style={linkStyle}
                  >
                    stripe.com/privacy
                  </a>
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>Rollbar</td>
                <td style={tdStyle}>Error monitoring and crash reporting</td>
                <td style={tdStyle}>
                  Stack traces, device info, may include user identifiers in
                  error context
                </td>
                <td style={tdStyle}>
                  <a
                    href="https://rollbar.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
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
                    style={linkStyle}
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
                    style={linkStyle}
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
                    style={linkStyle}
                  >
                    policies.google.com/privacy
                  </a>
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>
                  Google Analytics 4 (Google LLC; measurement ID G-DHBXH3R106)
                </td>
                <td style={tdStyle}>
                  Usage analytics: which pages and features are used, so we can
                  improve the Service. Only with your consent in the EEA, UK and
                  Switzerland; see section 5.
                </td>
                <td style={tdStyle}>
                  Pages viewed and in-app events (for example, starting a mock
                  draft); a pseudonymous browser ID (_ga cookie); when signed
                  in, your account ID, plan type, account age, number of leagues
                  and main sport; device and browser type; approximate location
                  derived from your IP address (Google Analytics 4 does not log
                  or store IP addresses). Google Analytics deletes this data
                  automatically when our data-retention period ends.
                </td>
                <td style={tdStyle}>
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    policies.google.com/privacy
                  </a>
                  <br />
                  Opt out: Cookie settings, or the{' '}
                  <a
                    href="https://tools.google.com/dlpage/gaoptout"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    Google Analytics opt-out add-on
                  </a>
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>GrowthBook</td>
                <td style={tdStyle}>
                  Feature flags and experiments: deciding which features, and
                  which version of a feature, you see.
                </td>
                <td style={tdStyle}>
                  Your browser downloads feature settings from GrowthBook&apos;s
                  content delivery network, which receives your IP address and
                  browser details as part of that request. Feature decisions are
                  made in your browser, and the settings are cached in local
                  storage. With analytics consent, which version of an
                  experiment you saw is sent to Google Analytics (not to
                  GrowthBook).
                </td>
                <td style={tdStyle}>
                  <a
                    href="https://www.growthbook.io/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    growthbook.io/privacy
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
