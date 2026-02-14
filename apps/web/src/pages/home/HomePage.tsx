import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  H1,
  H2,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { Card, ScrollView } from 'tamagui';

/**
 * Home Page - Landing page for the web application
 *
 * Displays welcome message and navigation to main sections.
 * Formerly: WebHomeScreen
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <ScrollView>
      <YStack
        padding="$4"
        space="$4"
        maxWidth={1200}
        width="100%"
        alignSelf="center"
      >
        <YStack space="$2">
          <H1>Welcome to Legacy Sports</H1>
          <Paragraph size="$6" theme="alt1">
            Your fantasy sports hub for baseball and football
          </Paragraph>
        </YStack>

        <YStack space="$4">
          <Card
            elevate
            size="$4"
            bordered
            hoverStyle={{ scale: 1.02 }}
            pressStyle={{ scale: 0.98 }}
            cursor="pointer"
            onPress={() => {
              navigate('/baseball');
            }}
            padding="$4"
          >
            <YStack space="$2">
              <H2>
                <span role="img" aria-label="baseball">
                  ⚾
                </span>{' '}
                Baseball
              </H2>
              <Paragraph theme="alt2">
                Manage your fantasy baseball leagues, draft players, and track
                stats
              </Paragraph>
            </YStack>
            <XStack space="$2" marginTop="$4">
              <Button
                onPress={() => {
                  navigate('/baseball');
                }}
              >
                View Leagues
              </Button>
              <Button
                variant="outlined"
                onPress={() => {
                  navigate('/baseball/league/create');
                }}
              >
                Create League
              </Button>
            </XStack>
          </Card>

          <Card
            elevate
            size="$4"
            bordered
            hoverStyle={{ scale: 1.02 }}
            pressStyle={{ scale: 0.98 }}
            cursor="pointer"
            onPress={() => {
              navigate('/football');
            }}
            padding="$4"
          >
            <YStack space="$2">
              <H2>
                <span role="img" aria-label="football">
                  🏈
                </span>{' '}
                Football
              </H2>
              <Paragraph theme="alt2">
                Manage your fantasy football leagues (coming soon)
              </Paragraph>
            </YStack>
            <Button
              marginTop="$4"
              onPress={() => {
                navigate('/football');
              }}
            >
              View Leagues
            </Button>
          </Card>

          <Card
            elevate
            size="$4"
            bordered
            hoverStyle={{ scale: 1.02 }}
            pressStyle={{ scale: 0.98 }}
            cursor="pointer"
            onPress={() => {
              navigate('/players/stats');
            }}
            padding="$4"
          >
            <YStack space="$2">
              <H2>
                <span role="img" aria-label="stats">
                  📊
                </span>{' '}
                Player Stats
              </H2>
              <Paragraph theme="alt2">
                Browse player statistics, projections, and trends
              </Paragraph>
            </YStack>
            <Button
              marginTop="$4"
              onPress={() => {
                navigate('/players/stats');
              }}
            >
              View Stats
            </Button>
          </Card>
        </YStack>
      </YStack>
    </ScrollView>
  );
}

export default HomePage;
