import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { HomeScreen, HomeScreenProps } from '../HomeScreen';

describe('HomeScreen', () => {
  const mockOnSportPress = jest.fn();

  const defaultProps: HomeScreenProps = {
    onSportPress: mockOnSportPress,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering Tests', () => {
    it('renders correctly with default props', () => {
      const { getByText } = render(<HomeScreen {...defaultProps} />);

      // Should render default title and subtitle
      expect(getByText('Fantasy Sports Hub')).toBeTruthy();
      expect(getByText('Choose your sport')).toBeTruthy();
    });

    it('renders correctly with custom title and subtitle', () => {
      const props: HomeScreenProps = {
        ...defaultProps,
        title: 'Custom Fantasy League',
        subtitle: 'Select your favorite sport',
      };

      const { getByText } = render(<HomeScreen {...props} />);
      expect(getByText('Custom Fantasy League')).toBeTruthy();
      expect(getByText('Select your favorite sport')).toBeTruthy();
    });

    it('renders custom sports list correctly', () => {
      const customSports = [
        { key: 'football', name: 'Football', enabled: true },
        { key: 'baseball', name: 'Baseball', enabled: true },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        sports: customSports,
      };

      const { getByText, queryByText } = render(<HomeScreen {...props} />);
      expect(getByText('Football')).toBeTruthy();
      expect(getByText('Baseball')).toBeTruthy();
      // Should not render other default sports
      expect(queryByText('Basketball')).toBeNull();
    });

    it('renders custom actions correctly', () => {
      const customActions = [
        {
          title: 'Settings',
          onPress: jest.fn(),
          color: '#007AFF',
        },
        {
          title: 'Help',
          onPress: jest.fn(),
          color: '#FF9500',
        },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        customActions,
      };

      const { getByText } = render(<HomeScreen {...props} />);
      expect(getByText('Settings')).toBeTruthy();
      expect(getByText('Help')).toBeTruthy();
    });

    it('handles disabled sports correctly when showAllSports is true', () => {
      const sportsWithDisabled = [
        { key: 'football', name: 'Football', enabled: true },
        { key: 'baseball', name: 'Baseball', enabled: false },
        { key: 'basketball', name: 'Basketball', enabled: true },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        sports: sportsWithDisabled,
        showAllSports: true,
      };

      const { getByText } = render(<HomeScreen {...props} />);
      expect(getByText('Football')).toBeTruthy();
      expect(getByText('Baseball')).toBeTruthy(); // Should show disabled sport
      expect(getByText('Basketball')).toBeTruthy();
    });

    it('filters out disabled sports when showAllSports is false', () => {
      const enabledSports = [
        { key: 'football', name: 'Football', enabled: true },
        { key: 'baseball', name: 'Baseball', enabled: false },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        sports: enabledSports,
        showAllSports: false,
      };

      const { getByText, queryByText } = render(<HomeScreen {...props} />);
      expect(getByText('Football')).toBeTruthy();
      expect(queryByText('Baseball')).toBeNull(); // Should not show disabled sport
    });

    it('handles empty sports list gracefully', () => {
      const props: HomeScreenProps = {
        ...defaultProps,
        sports: [],
      };

      const { getByText, queryByText } = render(<HomeScreen {...props} />);
      expect(getByText('Fantasy Sports Hub')).toBeTruthy();
      // Should not crash and should still show title
      expect(queryByText('Football')).toBeNull();
    });

    it('renders with full configuration correctly', () => {
      const fullConfigProps: HomeScreenProps = {
        title: 'Ultimate Fantasy Hub',
        subtitle: 'Choose your championship sport',
        sports: [
          { key: 'football', name: 'NFL Football', enabled: true, icon: '🏈' },
          { key: 'baseball', name: 'MLB Baseball', enabled: true, icon: '⚾' },
          {
            key: 'basketball',
            name: 'NBA Basketball',
            enabled: false,
            icon: '🏀',
          },
          { key: 'hockey', name: 'NHL Hockey', enabled: true, icon: '🏒' },
        ],
        onSportPress: mockOnSportPress,
        customActions: [
          {
            title: 'My Profile',
            onPress: jest.fn(),
            color: '#007AFF',
            icon: '👤',
          },
          {
            title: 'League Settings',
            onPress: jest.fn(),
            color: '#34C759',
            icon: '⚙️',
          },
        ],
        showAllSports: false,
      };

      const { getByText } = render(<HomeScreen {...fullConfigProps} />);
      expect(getByText('Ultimate Fantasy Hub')).toBeTruthy();
      expect(getByText('Choose your championship sport')).toBeTruthy();
      expect(getByText('NFL Football')).toBeTruthy();
      expect(getByText('My Profile')).toBeTruthy();
      expect(getByText('League Settings')).toBeTruthy();
    });
  });

  describe('Behavior Tests', () => {
    it('calls onSportPress when a sport card is pressed', () => {
      const { getByText } = render(<HomeScreen {...defaultProps} />);

      // Assuming default sports include Football
      const footballCard = getByText('Football');
      fireEvent.click(footballCard);

      expect(mockOnSportPress).toHaveBeenCalledWith('football');
    });

    it('calls custom action onPress when custom action is pressed', () => {
      const mockCustomAction = jest.fn();
      const customActions = [
        {
          title: 'Test Action',
          onPress: mockCustomAction,
        },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        customActions,
      };

      const { getByText } = render(<HomeScreen {...props} />);

      const actionButton = getByText('Test Action');
      fireEvent.click(actionButton);

      expect(mockCustomAction).toHaveBeenCalled();
    });

    it('only shows enabled sports when showAllSports is false', () => {
      const sportsWithDisabled = [
        { key: 'football', name: 'Football', enabled: true },
        { key: 'baseball', name: 'Baseball', enabled: false },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        sports: sportsWithDisabled,
        showAllSports: false,
      };

      const { getByText, queryByText } = render(<HomeScreen {...props} />);

      expect(getByText('Football')).toBeTruthy();
      expect(queryByText('Baseball')).toBeNull();
    });

    it('shows all sports including disabled when showAllSports is true', () => {
      const sportsWithDisabled = [
        { key: 'football', name: 'Football', enabled: true },
        { key: 'baseball', name: 'Baseball', enabled: false },
      ];

      const props: HomeScreenProps = {
        ...defaultProps,
        sports: sportsWithDisabled,
        showAllSports: true,
      };

      const { getByText } = render(<HomeScreen {...props} />);

      expect(getByText('Football')).toBeTruthy();
      expect(getByText('Baseball')).toBeTruthy();
    });
  });
});
