import React from 'react';
import { Link } from 'react-router-dom';
import { YStack } from 'tamagui';
import { NavBar } from '@legacy-sports/shared-components';
import { HeaderLogo } from './HeaderLogo';
import { NAV_Z_INDEX } from '../../constants/dimensions';

/**
 * Header for signed-out visitors on public routes (/terms, /pricing, /help…):
 * logo home + a Sign in control (LS-10767). The signed-in header's tabs and
 * account cluster are all auth-gated, so this is the design-system NavBar with
 * no links. One layout at every width — the bottom bar is hidden signed-out
 * (LS-10766), so this is the only way home on mobile too.
 *
 * Both links reload the document: `/` is the sign-in landing only when the
 * auth guard evaluates it on load.
 */
export function PublicHeader(): React.JSX.Element {
  return (
    <YStack
      role="banner"
      style={{ position: 'sticky' }}
      top={0}
      zIndex={NAV_Z_INDEX}
    >
      <NavBar
        brand=""
        logo={<HeaderLogo reloadDocument />}
        links={[]}
        trailing={
          <Link
            to="/"
            reloadDocument
            style={{
              textDecoration: 'none',
              backgroundColor: 'var(--brandNavy)',
              color: 'var(--textOnAccent)',
              fontWeight: 600,
              fontSize: 14,
              lineHeight: '20px',
              padding: '8px 16px',
              borderRadius: 9999,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Sign in
          </Link>
        }
      />
    </YStack>
  );
}
