import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Paragraph, XStack } from '@legacy-sports/shared-components/ui';
import { consumeBillingNotice } from '@legacy-sports/shared-components/auth';
import { AlertTriangle, X } from '@tamagui/lucide-icons';
import { AMBER, BRAND_NAVY_DARK, WHITE, withAlpha } from '../constants/colors';

/**
 * Post-login billing routing hint (LGN-029).
 *
 * After an email/password login, the /oauth/login response carries an advisory
 * `billingStatus` signal that AuthService stashes as a one-shot sessionStorage
 * notice. This banner consumes that notice on mount and, for a past-due premium
 * user, surfaces a dismissible hint routing them to billing — addressing the
 * finding that paused/past-due users logged in with no signal that their
 * subscription needed attention.
 *
 * The notice is consumed (read-and-cleared) on mount, so the banner shows at
 * most once per login and never reappears on subsequent reloads.
 */
export function PostLoginBillingBanner(): React.JSX.Element | null {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeBillingNotice() === 'past_due') {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleOpenBilling = () => {
    setVisible(false);
    void navigate('/subscription');
  };

  return (
    <div
      role="alert"
      data-testid="post-login-billing-banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9998,
        background: withAlpha(AMBER, 0.12),
        borderBottom: `1px solid ${withAlpha(AMBER, 0.4)}`,
      }}
    >
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$2"
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        maxWidth={1200}
        width="100%"
        alignSelf="center"
      >
        <XStack gap="$2" alignItems="center" flexWrap="wrap" flex={1}>
          <AlertTriangle size={18} color={AMBER} flexShrink={0} />
          <Paragraph size="$3" fontWeight="600" style={{ color: AMBER }}>
            Your premium subscription needs attention.
          </Paragraph>
          <Paragraph size="$3" style={{ color: withAlpha(WHITE, 0.8) }}>
            Open billing to resolve a past-due payment and keep your Premium
            access.
          </Paragraph>
        </XStack>

        <XStack gap="$2" alignItems="center" flexShrink={0}>
          <Button
            size="$3"
            onPress={handleOpenBilling}
            style={{ background: AMBER, borderWidth: 0 }}
          >
            <Paragraph
              size="$3"
              fontWeight="700"
              style={{ color: BRAND_NAVY_DARK }}
            >
              Open Billing
            </Paragraph>
          </Button>
          <Button
            size="$3"
            circular
            aria-label="Dismiss billing notice"
            onPress={() => setVisible(false)}
            icon={<X size={16} color={AMBER} />}
            style={{
              background: 'transparent',
              borderColor: withAlpha(AMBER, 0.4),
              borderWidth: 1,
            }}
          />
        </XStack>
      </XStack>
    </div>
  );
}

export default PostLoginBillingBanner;
