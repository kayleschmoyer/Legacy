import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { useAuth } from '@legacy-sports/shared-components';
import { styled } from 'tamagui';

const UserMenuButton = styled(Button, {
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$12',
  padding: '$2',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  pressStyle: {
    backgroundColor: '$color3',
  },
});

const ProfileImage = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$12',
  backgroundColor: '$blue6',
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 2,
  borderColor: '$borderColor',
});

const DropdownContent = styled(YStack, {
  backgroundColor: '$background',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$3',
  space: '$2',
  minWidth: 200,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 12,
  elevation: 8,
});

const MenuItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  padding: '$3',
  borderRadius: '$3',
  hoverStyle: {
    backgroundColor: '$color2',
  },
  pressStyle: {
    backgroundColor: '$color3',
  },
});

export const UserProfileDropdown: React.FC = () => {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Extract user data from auth context (with fallback values)
  const userName = auth?.user?.username || '';
  const userEmail = auth?.user?.email || '';
  const userImage = auth?.user?.picture || null;

  // Reset image error state when user image changes
  useEffect(() => {
    setImageError(false);
  }, [userImage]);

  // Don't render anything if user is not authenticated
  if (!auth?.isAuthenticated || !auth.user) {
    return null;
  }

  // DEBUG: Log the auth object and picture field
  console.log('[UserProfileDropdown] Full auth object:', auth);
  console.log('[UserProfileDropdown] auth.user:', auth.user);
  console.log('[UserProfileDropdown] auth.user.picture:', auth.user.picture);
  console.log('[UserProfileDropdown] userImage value:', userImage);

  const handleLogout = async () => {
    try {
      setIsOpen(false);
      if (auth?.logout) {
        await auth.logout();
      } else {
        // Fallback logout logic
        console.log('Logging out...');
        window.location.reload();
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <YStack position="relative" ref={dropdownRef}>
      <UserMenuButton onPress={() => setIsOpen(!isOpen)}>
        <XStack alignItems="center" space="$2">
          <ProfileImage>
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
                onError={(e) => {
                  console.error('[UserProfileDropdown] Image failed to load:', userImage, e);
                  console.log('[UserProfileDropdown] Switching to initials fallback');
                  setImageError(true);
                }}
                onLoad={() => {
                  console.log('[UserProfileDropdown] Image loaded successfully:', userImage);
                  setImageError(false);
                }}
              />
            ) : (
              <Paragraph size="$5" color="white" fontWeight="600">
                {userName.charAt(0).toUpperCase()}
              </Paragraph>
            )}
          </ProfileImage>
          <YStack display="none" $gtSm={{ display: 'flex' }}>
            <Paragraph size="$3" color="$color" fontWeight="500">
              {userName}
            </Paragraph>
          </YStack>
          <Paragraph size="$2" color="$colorPress">
            {isOpen ? '▲' : '▼'}
          </Paragraph>
        </XStack>
      </UserMenuButton>

      {isOpen && (
        <DropdownContent
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          zIndex={100}
        >
          {/* User Info Section */}
          <YStack space="$2" paddingBottom="$3">
            <Paragraph size="$4" color="$color" fontWeight="600">
              {userName}
            </Paragraph>
            <Paragraph size="$3" color="$colorPress">
              {userEmail}
            </Paragraph>
          </YStack>

          <Separator />

          {/* Menu Items */}
          <YStack space="$1" paddingTop="$3">
            <MenuItem
              onPress={() => {
                console.log('Profile clicked');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" space="$3">
                <Paragraph size="$4">
                  <span role="img" aria-label="user profile">
                    👤
                  </span>
                </Paragraph>
                <Paragraph size="$3" color="$color">
                  Profile Settings
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                console.log('Preferences clicked');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" space="$3">
                <Paragraph size="$4">
                  <span role="img" aria-label="settings">
                    ⚙️
                  </span>
                </Paragraph>
                <Paragraph size="$3" color="$color">
                  Preferences
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                console.log('Help clicked');
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" space="$3">
                <Paragraph size="$4">
                  <span role="img" aria-label="help">
                    ❓
                  </span>
                </Paragraph>
                <Paragraph size="$3" color="$color">
                  Help & Support
                </Paragraph>
              </XStack>
            </MenuItem>

            <Separator marginVertical="$2" />

            <MenuItem onPress={handleLogout}>
              <XStack alignItems="center" space="$3">
                <Paragraph size="$4">
                  <span role="img" aria-label="exit">
                    🚪
                  </span>
                </Paragraph>
                <Paragraph size="$3" color="$red10" fontWeight="500">
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
