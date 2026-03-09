import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { useAuth } from '@legacy-sports/shared-components';
import { useNavigate } from 'react-router-dom';
import { styled } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  LogOut,
  Settings,
  Settings2,
  Shield,
  User,
} from '@tamagui/lucide-icons';

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
  backgroundColor: '$background',
  borderRadius: '$5',
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$4',
  space: '$2',
  minWidth: 240,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 24,
  elevation: 12,
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
  width: 34,
  height: 34,
  borderRadius: '$3',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
  flexShrink: 0,
});

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

  const handleLogout = async () => {
    try {
      setIsOpen(false);
      if (auth?.logout) {
        await auth.logout();
      } else {
        // Fallback logout logic
        window.location.reload();
      }
    } catch (error) {
      LOGGER.error('Error during logout:', String(error));
    }
  };

  return (
    <YStack position="relative" ref={dropdownRef}>
      <UserMenuButton onPress={() => setIsOpen(!isOpen)}>
        <XStack alignItems="center" gap="$2">
          <ProfileImage
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
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
          position="absolute"
          top="100%"
          right={0}
          marginTop="$2"
          zIndex={100}
        >
          {/* User Info Section */}
          <XStack padding="$2" gap="$3" alignItems="center">
            <ProfileImage
              width={40}
              height={40}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
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
                  onError={() => setImageError(true)}
                />
              ) : (
                <Paragraph size="$5" color="white" fontWeight="700">
                  {userName.charAt(0).toUpperCase()}
                </Paragraph>
              )}
            </ProfileImage>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                {userName}
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                {userEmail}
              </Paragraph>
            </YStack>
          </XStack>

          <Separator />

          {/* Menu Items */}
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
                <Paragraph size="$3" color="$color" fontWeight="500">
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
                <Paragraph size="$3" color="$color" fontWeight="500">
                  Preferences
                </Paragraph>
              </XStack>
            </MenuItem>

            <MenuItem
              onPress={() => {
                setIsOpen(false);
              }}
            >
              <XStack alignItems="center" gap="$3" flex={1}>
                <MenuIconBox>
                  <HelpCircle size={18} color="$color" />
                </MenuIconBox>
                <Paragraph size="$3" color="$color" fontWeight="500">
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
                <Paragraph size="$3" color="$color" fontWeight="500">
                  Management
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
                  <Paragraph size="$3" color="$color" fontWeight="500">
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
                <Paragraph size="$3" color="$red10" fontWeight="600">
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
