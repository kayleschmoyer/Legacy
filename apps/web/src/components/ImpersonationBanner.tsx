import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Paragraph, XStack } from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  BRAND_SEAM_RED,
  withAlpha,
} from '../constants/colors';

/**
 * A sticky banner displayed at the top of the page when an admin is
 * impersonating another user.  Shows who is being impersonated and provides
 * a one-click way to revert back to the original admin session.
 */
export function ImpersonationBanner(): React.JSX.Element | null {
  const auth = useAuth();
  const navigate = useNavigate();

  if (!auth.isImpersonating) return null;

  const targetUsername =
    auth.user?.username || auth.user?.email || `User #${auth.user?.id}`;
  const adminUsername =
    auth.adminUser?.username || auth.adminUser?.email || 'Admin';

  const handleStop = () => {
    void auth.stopImpersonating().then(() => {
      void navigate('/admin');
    });
  };

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        background: BRAND_SEAM_RED,
        borderBottom: `2px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.4)}`,
      }}
    >
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$2"
        alignItems="center"
        justifyContent="space-between"
        maxWidth={1200}
        width="100%"
        alignSelf="center"
      >
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {/* Icon */}
          <Paragraph fontSize={16} lineHeight={18}>
            <span role="img" aria-label="impersonating">
              🎭
            </span>
          </Paragraph>

          <Paragraph size="$3" fontWeight="700" style={{ color: '#FFFFFF' }}>
            Impersonating
          </Paragraph>

          <Paragraph
            size="$3"
            fontWeight="800"
            style={{ color: BRAND_GOLD_LIGHT }}
          >
            {targetUsername}
          </Paragraph>

          <Paragraph size="$3" style={{ color: withAlpha('#FFFFFF', 0.75) }}>
            (signed in as{' '}
            <span style={{ fontWeight: '700', color: '#FFFFFF' }}>
              {adminUsername}
            </span>
            )
          </Paragraph>
        </XStack>

        <Button
          size="$3"
          onPress={handleStop}
          style={{
            background: withAlpha(BRAND_NAVY_DARK, 0.85),
            borderColor: BRAND_GOLD_LIGHT,
            borderWidth: 1,
            flexShrink: 0,
          }}
        >
          <Paragraph
            size="$3"
            fontWeight="700"
            style={{ color: BRAND_GOLD_LIGHT }}
          >
            Stop Impersonating
          </Paragraph>
        </Button>
      </XStack>
    </div>
  );
}

export default ImpersonationBanner;
