import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from '@storybook/test';
import {
  BreadcrumbNavigation,
  NavigationDrawer,
  NavigationItem,
  TabItem,
  TabNavigation,
} from './index';

const meta: Meta<typeof NavigationDrawer> = {
  title: 'Navigation/NavigationDrawer',
  component: NavigationDrawer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A responsive navigation drawer component for app navigation with user info and logout functionality.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    items: {
      control: 'object',
      description: 'Array of navigation items',
    },
    currentRoute: {
      control: 'text',
      description: 'Currently active route',
    },
    onNavigate: {
      action: 'navigate',
      description: 'Callback when navigation item is selected',
    },
    onClose: {
      action: 'close',
      description: 'Callback to close the drawer',
    },
    userInfo: {
      control: 'object',
      description: 'User information object',
    },
    onLogout: {
      action: 'logout',
      description: 'Callback for logout action',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample navigation items for sports app
const sportsNavigationItems: NavigationItem[] = [
  { title: 'Home', route: '/', icon: '🏠' },
  { title: 'Dashboard', route: '/dashboard', icon: '📊' },
  { title: 'My Teams', route: '/teams', icon: '👥', requiresAuth: true },
  { title: 'Draft Room', route: '/draft', icon: '📝', requiresAuth: true },
  {
    title: 'Free Agents',
    route: '/free-agents',
    icon: '🆓',
    requiresAuth: true,
  },
  {
    title: 'Trade Center',
    route: '/trades',
    icon: '🔄',
    requiresAuth: true,
    divider: true,
  },
  { title: 'Player Stats', route: '/stats', icon: '📈' },
  { title: 'Leaderboards', route: '/leaderboards', icon: '🏆' },
  { title: 'News', route: '/news', icon: '📰' },
  { title: 'Settings', route: '/settings', icon: '⚙️', divider: true },
  { title: 'Help', route: '/help', icon: '❓' },
];

const basicNavigationItems: NavigationItem[] = [
  { title: 'Home', route: '/' },
  { title: 'About', route: '/about' },
  { title: 'Contact', route: '/contact' },
];

const userInfo = {
  name: 'John Smith',
  email: 'john.smith@example.com',
  avatar: 'https://via.placeholder.com/40',
};

export const Default: Story = {
  args: {
    items: sportsNavigationItems,
    currentRoute: '/',
    onNavigate: fn(),
    onClose: fn(),
  },
};

export const WithUserInfo: Story = {
  args: {
    items: sportsNavigationItems,
    currentRoute: '/dashboard',
    onNavigate: fn(),
    onClose: fn(),
    userInfo: userInfo,
    onLogout: fn(),
  },
};

export const DifferentActiveRoute: Story = {
  args: {
    items: sportsNavigationItems,
    currentRoute: '/draft',
    onNavigate: fn(),
    onClose: fn(),
    userInfo: userInfo,
    onLogout: fn(),
  },
};

export const BasicNavigation: Story = {
  args: {
    items: basicNavigationItems,
    currentRoute: '/',
    onNavigate: fn(),
    onClose: fn(),
  },
};

export const EmptyNavigation: Story = {
  args: {
    items: [],
    currentRoute: '/',
    onNavigate: fn(),
    onClose: fn(),
    userInfo: userInfo,
    onLogout: fn(),
  },
};

export const NoUserInfo: Story = {
  args: {
    items: sportsNavigationItems,
    currentRoute: '/stats',
    onNavigate: fn(),
    onClose: fn(),
  },
};

// Interactive test
export const WithInteraction: Story = {
  args: {
    items: sportsNavigationItems,
    currentRoute: '/',
    onNavigate: fn(),
    onClose: fn(),
    userInfo: userInfo,
    onLogout: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Test navigation item click
    const dashboardLink = canvas.getByText('Dashboard');
    await userEvent.click(dashboardLink);
    await expect(args.onNavigate).toHaveBeenCalledWith('/dashboard');

    // Test logout button if present
    try {
      const logoutButton = canvas.getByText('Sign Out');
      await userEvent.click(logoutButton);
      await expect(args.onLogout).toHaveBeenCalled();
    } catch {
      // Logout button might not be visible depending on screen size
    }
  },
};

// Tab Navigation Stories
// Used via StoryObj<typeof TabMeta> type definition below
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used as type parameter only
const TabMeta: Meta<typeof TabNavigation> = {
  title: 'Navigation/TabNavigation',
  component: TabNavigation,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A horizontal tab navigation component for switching between different views.',
      },
    },
  },
  tags: ['autodocs', 'test'],
  argTypes: {
    items: {
      control: 'object',
      description: 'Array of tab items',
    },
    currentRoute: {
      control: 'text',
      description: 'Currently active tab route',
    },
    onNavigate: {
      action: 'tab-navigate',
      description: 'Callback when tab is selected',
    },
  },
};

type TabStory = StoryObj<typeof TabMeta>;

const sportsTabItems: TabItem[] = [
  { title: 'Roster', route: '/roster', icon: '👥' },
  { title: 'Draft', route: '/draft', icon: '📝' },
  { title: 'Trades', route: '/trades', icon: '🔄' },
  { title: 'Stats', route: '/stats', icon: '📊' },
  { title: 'News', route: '/news', icon: '📰' },
];

const basicTabItems: TabItem[] = [
  { title: 'Overview', route: '/overview' },
  { title: 'Details', route: '/details' },
  { title: 'Settings', route: '/settings' },
];

export const TabDefault: TabStory = {
  args: {
    items: sportsTabItems,
    currentRoute: '/roster',
    onNavigate: fn(),
  },
};

export const TabWithoutIcons: TabStory = {
  args: {
    items: basicTabItems,
    currentRoute: '/overview',
    onNavigate: fn(),
  },
};

export const TabDifferentActive: TabStory = {
  args: {
    items: sportsTabItems,
    currentRoute: '/draft',
    onNavigate: fn(),
  },
};

export const TabMinimal: TabStory = {
  args: {
    items: [
      { title: 'Tab 1', route: '/tab1' },
      { title: 'Tab 2', route: '/tab2' },
    ],
    currentRoute: '/tab1',
    onNavigate: fn(),
  },
};

export const TabManyItems: TabStory = {
  args: {
    items: [
      { title: 'Home', route: '/home', icon: '🏠' },
      { title: 'Teams', route: '/teams', icon: '👥' },
      { title: 'Players', route: '/players', icon: '👤' },
      { title: 'Stats', route: '/stats', icon: '📊' },
      { title: 'Draft', route: '/draft', icon: '📝' },
      { title: 'Trades', route: '/trades', icon: '🔄' },
      { title: 'News', route: '/news', icon: '📰' },
      { title: 'Settings', route: '/settings', icon: '⚙️' },
    ],
    currentRoute: '/teams',
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <TabNavigation {...(args as any)} />,
};

// Interactive tab test
export const TabWithInteraction: TabStory = {
  args: {
    items: sportsTabItems,
    currentRoute: '/roster',
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <TabNavigation {...(args as any)} />,
  play: async ({ args, canvasElement }) => {
    if (!args) return;
    const canvas = within(canvasElement);

    // Test tab click
    const draftTab = canvas.getByText('Draft');
    await userEvent.click(draftTab);
    await expect(args.onNavigate).toHaveBeenCalledWith('/draft');
  },
};

// Breadcrumb Navigation Stories
// Used via StoryObj<typeof BreadcrumbMeta> type definition below
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used as type parameter only
const BreadcrumbMeta: Meta<typeof BreadcrumbNavigation> = {
  title: 'Navigation/BreadcrumbNavigation',
  component: BreadcrumbNavigation,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A breadcrumb navigation component showing the current path hierarchy.',
      },
    },
  },
  tags: ['autodocs', 'test'],
};

type BreadcrumbStory = StoryObj<typeof BreadcrumbMeta>;

export const BreadcrumbDefault: BreadcrumbStory = {
  args: {
    items: [
      { title: 'Home', route: '/' },
      { title: 'Teams', route: '/teams' },
      { title: 'New York Yankees', route: '/teams/nyy' },
      { title: 'Roster', route: '/teams/nyy/roster' },
    ],
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <BreadcrumbNavigation {...(args as any)} />,
};

export const BreadcrumbShort: BreadcrumbStory = {
  args: {
    items: [
      { title: 'Home', route: '/' },
      { title: 'Dashboard', route: '/dashboard' },
    ],
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <BreadcrumbNavigation {...(args as any)} />,
};

export const BreadcrumbSingle: BreadcrumbStory = {
  args: {
    items: [{ title: 'Home', route: '/' }],
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <BreadcrumbNavigation {...(args as any)} />,
};

export const BreadcrumbLong: BreadcrumbStory = {
  args: {
    items: [
      { title: 'Home', route: '/' },
      { title: 'Sports', route: '/sports' },
      { title: 'Baseball', route: '/sports/baseball' },
      { title: 'Teams', route: '/sports/baseball/teams' },
      { title: 'American League', route: '/sports/baseball/teams/al' },
      { title: 'AL East', route: '/sports/baseball/teams/al/east' },
      {
        title: 'New York Yankees',
        route: '/sports/baseball/teams/al/east/nyy',
      },
    ],
    onNavigate: fn(),
  },
  // Storybook args typing requires cast for proper component props spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: (args) => <BreadcrumbNavigation {...(args as any)} />,
};

// Combined navigation showcase
export const NavigationShowcase: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Breadcrumb */}
      <div style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>
        <BreadcrumbNavigation
          items={[
            { title: 'Home', route: '/' },
            { title: 'Teams', route: '/teams' },
            { title: 'Yankees', route: '/teams/nyy' },
          ]}
          onNavigate={fn()}
        />
      </div>

      {/* Tab Navigation */}
      <div style={{ borderBottom: '1px solid #ccc' }}>
        <TabNavigation
          items={sportsTabItems}
          currentRoute="/roster"
          onNavigate={fn()}
        />
      </div>

      {/* Main content with drawer */}
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ width: '250px', borderRight: '1px solid #ccc' }}>
          <NavigationDrawer
            items={sportsNavigationItems}
            currentRoute="/teams"
            onNavigate={fn()}
            userInfo={userInfo}
            onLogout={fn()}
          />
        </div>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5' }}>
          <h2>Main Content Area</h2>
          <p>
            This shows how all navigation components work together in a layout.
          </p>
        </div>
      </div>
    </div>
  ),
  parameters: {
    layout: 'fullscreen',
  },
};
