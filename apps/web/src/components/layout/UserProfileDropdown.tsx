import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { useNavigate } from 'react-router-dom';
import { styled } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Settings2,
  Shield,
  Sun,
  User,
} from '@tamagui/lucide-icons';
import {
  DROPDOWN_BORDER,
  FONT_DISPLAY,
  NAV_DROPDOWN_ANIMATION,
} from './NavDropdownShared';
import { GRADIENT_AVATAR } from '../../constants/colors';
import { formatDisplayName } from '../../lib/formatDisplayName';
import {
  type ThemePreference,
  useThemeContext,
} from '../../context/ThemeContext';
import { NAV_DROPDOWN_Z_INDEX } from '../../constants/dimensions';

const UserMenuButton = styled(Button, {
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$10',
  padding: '$2',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
    scale: 0.97,
  },
});

const ProfileImage = styled(YStack, {
  width: 34,
  height: 34,
  borderRadius: '$12',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
  borderColor: 'transparent',
});

const DropdownContent = styled(YStack, {
  backgroundColor: '$color2',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$4',
  gap: '$2',
  minWidth: 240,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.5,
  shadowRadius: 36,
  elevation: 14,
});

const MenuItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingHorizontal: '$3',
  paddingVertical: '$3',
  borderRadius: '$4',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
  },
});

const MenuIconBox = styled(YStack, {
  width: 38,
  height: 38,
  borderRadius: '$3',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
  flexShrink: 0,
});

const ThemeOptionButton = styled(Button, {
  flex: 1,
  backgroundColor: '$color2',
  borderWidth: 1,
  borderColor: 'transparent',
  borderRadius: '$3',
  paddingVertical: '$2',
  paddingHorizontal: '$1',
  hoverStyle: { backgroundColor: '$color3' },
  pressStyle: { scale: 0.96 },
  variants: {
    active: {
      true: {
        backgroundColor: '$accentMuted',
        borderColor: '$brandNavy',
        hoverStyle: { backgroundColor: '$accentMuted' },
      },
    },
  } as const,
});

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

function ThemeToggleRow() {
  const { themePreference, setThemePreference } = useThemeContext();

  return (
    <YStack gap="$1" paddingVertical="$1">
      <Paragraph size="$2" color="$colorPress" paddingHorizontal="$1">
        Theme
      </Paragraph>
      <XStack gap="$1">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <ThemeOptionButton
            key={value}
            active={themePreference === value}
            onPress={() => setThemePreference(value)}
            aria-label={`${label} theme`}
            aria-pressed={themePreference === value}
          >
            <YStack alignItems="center" gap="$1">
              <Icon
                size={16}
                color={themePreference === value ? '$brandNavy' : '$colorPress'}
              />
              <Paragraph
                size="$1"
                color={themePreference === value ? '$brandNavy' : '$colorPress'}
                fontWeight={themePreference === value ? '600' : '400'}
              >
                {label}
              </Paragraph>
            </YStack>
          </ThemeOptionButton>
        ))}
      </XStack>
    </YStack>
  );
}

export const UserProfileDropdown: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isAdmin = auth?.user?.accessLevel === 'admin';

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const userName = formatDisplayName(auth?.user?.username || '');
  const userEmail = auth?.user?.email || '';
  const userImage = auth?.user?.picture || null;

  useEffect(() => {
    setImageError(false);
  }, [userImage]);

  if (!auth?.isAuthenticated || !auth.user) {
    return null;
  }

  const handleLogout = () => {
    try {
      setIsOpen(false);
      if (auth?.logout) {
        // Navigate first (replace so Back doesn't return to the public path and
        // bypass the auth guard again), then fire logout in the background.
        // The UI transition is immediate — the server-side cookie clear runs
        // via fire-and-forget inside auth.logout().
        navigate('/', { replace: true });
        // logout() always resolves (requestLogout swallows errors internally).
        void auth.logout();
      } else {
        window.location.reload();
      }
    } catch (error) {
      LOGGER.error('Error during logout:', String(error));
    }
  };

  return (
    <YStack position="relative" ref={dropdownRef}>
      <UserMenuButton
        onPress={() => setIsOpen(!isOpen)}
        data-testid="user-profile-trigger"
        aria-label="User profile menu"
        aria-expanded={isOpen}
      >
        <XStack alignItems="center" gap="$2">
          <ProfileImage
            style={{
              background: GRADIENT_AVATAR,
            }}
          >
            {userImage && !imageError ? (
              <img
                src={userImage}
                alt={userName}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
                onError={() => {
                  setImageError(true);
                }}
                onLoad={() => {
                  setImageError(false);
                }}
              />
            ) : (
              <Paragraph size="$4" color="white" fontWeight="700">
                {userName.charAt(0).toUpperCase()}
              </Paragraph>
            )}
          </ProfileImage>
          <YStack display="none" $gtSm={{ display: 'flex' }}>
            <Paragraph size="$3" color="$color" fontWeight="500">
              {userName}
            </Paragraph>
          </YStack>
          {isOpen ? (
            <ChevronUp size={14} color="$colorPress" />
          ) : (
            <ChevronDown size={14} color="$colorPress" />
          )}
        </XStack>
      </UserMenuButton>

      {isOpen && (
        <DropdownContent
          data-testid="user-profile-dropdown"
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          zIndex={NAV_DROPDOWN_Z_INDEX}
          style={{
            borderColor: DROPDOWN_BORDER,
            animation: NAV_DROPDOWN_ANIMATION,
          }}
        >
          {/* User Info — name + email only; avatar is in the trigger button above */}
          <YStack padding="$2" paddingBottom="$3">
            <Paragraph
              size="$4"
              color="$color"
              fontWeight="600"
              marginBottom={0}
            >
              {userName}
            </Paragraph>
            <Paragraph size="$2" color="$colorPress" marginBottom={0}>
              {userEmail}
            </Paragraph>
          </YStack>

          <Separator />

          {/* Theme toggle */}
          <ThemeToggleRow />

          <Separator />

          {/* Account items */}
          <YStack gap="$1" paddingTop="$2">
            <MenuItem
              onPress={() => {
                void navigate('/profile/settings');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <User size={18} color="$color" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$color"
                  fontWeight="600"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  Profile Settings
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                void navigate('/preferences');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <Settings size={18} color="$color" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$color"
                  fontWeight="600"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  Preferences
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                void navigate('/profile/subscription');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <CreditCard size={18} color="$color" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$color"
                  fontWeight="600"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  Subscription
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                void navigate('/help');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <HelpCircle size={18} color="$color" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$color"
                  fontWeight="600"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  Help &amp; Support
                </Paragraph>
              </XStack>
            </MenuItem>

            <Separator marginVertical="$2" />

            <MenuItem
              onPress={() => {
                void navigate('/management');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <Settings2 size={18} color="$color" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$color"
                  fontWeight="600"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  League Management
                </Paragraph>
              </XStack>
            </MenuItem>

            {isAdmin && (
              <MenuItem
                onPress={() => {
                  void navigate('/admin');
                  setIsOpen(false);
                }}
              >
                <XStack alignItems="center" gap="$3" flex={1}>
                  <MenuIconBox>
                    <Shield size={18} color="$color" />
                  </MenuIconBox>
                  <Paragraph
                    size="$3"
                    color="$color"
                    fontWeight="600"
                    style={
                      {
                        fontFamily: FONT_DISPLAY,
                        letterSpacing: '0.01em',
                      } as React.CSSProperties
                    }
                  >
                    Admin
                  </Paragraph>
                </XStack>
              </MenuItem>
            )}

            <Separator marginVertical="$2" />

            <MenuItem onPress={handleLogout}>
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox backgroundColor="$red3">
                  <LogOut size={18} color="$red10" />
                </MenuIconBox>
                <Paragraph
                  size="$3"
                  color="$red10"
                  fontWeight="700"
                  style={
                    {
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.01em',
                    } as React.CSSProperties
                  }
                >
                  Sign Out
                </Paragraph>
              </XStack>
            </MenuItem>
          </YStack>
        </DropdownContent>
      )}
    </YStack>
  );
};
