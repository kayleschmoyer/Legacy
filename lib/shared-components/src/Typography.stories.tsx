import type { Meta, StoryObj } from '@storybook/react';
import { H1, H2, H3, Paragraph, YStack, Separator } from './Layout';

// Typography Stories - Combined
const TypographyMeta: Meta = {
  title: 'Typography/All Components',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Typography components including headings and paragraphs',
      },
    },
  },
  tags: ['autodocs'],
};

export default TypographyMeta;

// H1 Stories
export const HeadingH1: StoryObj = {
  name: 'H1 - Main Heading',
  render: () => (
    <YStack>
      <H1>Main Page Title</H1>
      <Paragraph>This is how the main heading (H1) looks.</Paragraph>
    </YStack>
  ),
};

export const HeadingH2: StoryObj = {
  name: 'H2 - Section Heading',
  render: () => (
    <YStack>
      <H2>Section Heading</H2>
      <Paragraph>This is how section headings (H2) appear.</Paragraph>
    </YStack>
  ),
};

export const HeadingH3: StoryObj = {
  name: 'H3 - Subsection Heading',
  render: () => (
    <YStack>
      <H3>Subsection Title</H3>
      <Paragraph>This is how subsection headings (H3) look.</Paragraph>
    </YStack>
  ),
};

export const ParagraphText: StoryObj = {
  name: 'Paragraph Text',
  render: () => (
    <YStack>
      <Paragraph>
        This is a standard paragraph. It can contain multiple sentences and will
        wrap appropriately based on the container width. Lorem ipsum dolor sit
        amet, consectetur adipiscing elit.
      </Paragraph>
    </YStack>
  ),
};

export const TypographyHierarchy: StoryObj = {
  name: 'Typography Hierarchy',
  render: () => (
    <YStack space="$3" maxWidth={600}>
      <H1>Legacy Sports App</H1>
      <Paragraph>
        Welcome to the Legacy Sports application. This demonstrates our
        typography hierarchy and how different text elements work together.
      </Paragraph>

      <Separator />

      <H2>Player Statistics</H2>
      <Paragraph>
        Here's where we show detailed player performance data and analytics.
      </Paragraph>

      <H3>Season Overview</H3>
      <Paragraph>
        Current season performance metrics including games played, points
        scored, and team rankings.
      </Paragraph>

      <H3>Recent Games</H3>
      <Paragraph>
        Latest game results and individual player contributions to team success.
      </Paragraph>

      <Separator />

      <H2>Team Management</H2>
      <Paragraph>
        Tools for managing team rosters, schedules, and administrative tasks.
      </Paragraph>
    </YStack>
  ),
};

export const LongFormContent: StoryObj = {
  name: 'Long Form Content',
  render: () => (
    <YStack space="$3" maxWidth={600}>
      <H1>About Legacy Sports</H1>

      <Paragraph>
        Legacy Sports is a comprehensive sports management platform designed to
        help teams, coaches, and players track performance, manage schedules,
        and analyze game data. Our platform brings together all the tools needed
        for effective sports team management.
      </Paragraph>

      <H2>Key Features</H2>

      <H3>Performance Tracking</H3>
      <Paragraph>
        Track individual and team performance metrics across multiple games and
        seasons. Our advanced analytics help identify trends and areas for
        improvement.
      </Paragraph>

      <H3>Schedule Management</H3>
      <Paragraph>
        Easily manage team schedules, practice times, and game dates. Automatic
        notifications keep everyone informed of changes and upcoming events.
      </Paragraph>

      <H3>Player Development</H3>
      <Paragraph>
        Monitor player growth and development over time. Set goals, track
        progress, and celebrate achievements as players improve their skills.
      </Paragraph>

      <Separator />

      <Paragraph>
        Ready to get started? Sign up today and take your team management to the
        next level with Legacy Sports.
      </Paragraph>
    </YStack>
  ),
};
