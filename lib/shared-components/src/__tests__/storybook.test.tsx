import { render } from '@testing-library/react';
import { composeStories } from '@storybook/react';

// Import Welcome stories (safe story without React Native dependencies)
import * as WelcomeStories from '../Welcome.stories';

// Compose stories for testing
const { Welcome } = composeStories(WelcomeStories);

describe('Storybook Stories - Welcome', () => {
  it('should render Welcome story without errors', () => {
    // This tests that the story can be rendered successfully
    const { container } = render(<Welcome />);

    // Basic smoke test - story should render something
    expect(container.firstChild).toBeTruthy();
    expect(container.innerHTML).toContain('Legacy Sports');
  });

  it('should contain expected content', () => {
    const { getByText } = render(<Welcome />);

    // Test specific content
    expect(getByText('Legacy Sports Shared Components')).toBeInTheDocument();
  });
});
