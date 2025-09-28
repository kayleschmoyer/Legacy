import { render, screen } from '@testing-library/react';
import { composeStories } from '@storybook/react';

// Import all stories from Welcome
import * as WelcomeStories from '../src/Welcome.stories';
import * as LayoutStories from '../src/Layout.stories';
import * as XStackStories from '../src/XStack.stories';
import * as YStackStories from '../src/YStack.stories';
import * as TypographyStories from '../src/Typography.stories';

// Compose stories for testing
const { Welcome } = composeStories(WelcomeStories);
const { BasicCard, StackedCards } = composeStories(LayoutStories);
const { BasicXStack, SpacedXStack } = composeStories(XStackStories);
const { BasicYStack, SpacedYStack } = composeStories(YStackStories);
const { AllTypography } = composeStories(TypographyStories);

describe('Storybook Stories', () => {
  describe('Welcome Stories', () => {
    it('should render Welcome story without errors', () => {
      render(<Welcome />);
      expect(
        screen.getByText('Legacy Sports Shared Components'),
      ).toBeInTheDocument();
    });
  });

  describe('Layout Stories', () => {
    it('should render BasicCard story without errors', () => {
      render(<BasicCard />);
      // Basic smoke test - component should render without throwing
      expect(document.body).toBeInTheDocument();
    });

    it('should render StackedCards story without errors', () => {
      render(<StackedCards />);
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('Stack Stories', () => {
    it('should render XStack stories without errors', () => {
      render(<BasicXStack />);
      expect(document.body).toBeInTheDocument();

      render(<SpacedXStack />);
      expect(document.body).toBeInTheDocument();
    });

    it('should render YStack stories without errors', () => {
      render(<BasicYStack />);
      expect(document.body).toBeInTheDocument();

      render(<SpacedYStack />);
      expect(document.body).toBeInTheDocument();
    });
  });

  describe('Typography Stories', () => {
    it('should render Typography story without errors', () => {
      render(<AllTypography />);
      expect(document.body).toBeInTheDocument();
    });
  });
});
