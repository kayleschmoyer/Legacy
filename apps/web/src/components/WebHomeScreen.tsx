import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  H1,
  H2,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components';
import { ScrollView } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';

export function WebHomeScreen(): React.JSX.Element {
  const navigate = useNavigate();

  const handleSportPress = (sportKey: string) => {
    // Map sport keys to routes
    const routeMap: Record<string, string> = {
      football: '/football',
      baseball: '/baseball',
      basketball: '/basketball',
      hockey: '/hockey',
    };

    const route = routeMap[sportKey];
    if (route) {
      navigate(route);
    }
  };

  const handleQuickAction = (action: string) => {
    LOGGER.info(`Quick action: ${action}`);
    // Add navigation logic for quick actions
  };

  return (
    <ScrollView flex={1}>
      <YStack
        padding="$6"
        $sm={{ padding: '$3', gap: '$4' }}
        space="$6"
        maxWidth={1200}
        alignSelf="center"
        width="100%"
      >
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$10" color="$color" textAlign="center">
            <span role="img" aria-label="football">
              🏈
            </span>{' '}
            Legacy Sports Hub
          </H1>
          <Paragraph size="$6" color="$colorPress" textAlign="center">
            Your complete fantasy sports management platform
          </Paragraph>
        </YStack>

        {/* Quick Actions */}
        <YStack space="$4">
          <H2 size="$7" color="$color">
            Quick Actions
          </H2>
          <XStack space="$4" flexWrap="wrap">
            <Button
              variant="secondary"
              size="$5"
              onPress={() => handleQuickAction('draft')}
              flex={1}
              minWidth={150}
            >
              <span role="img" aria-label="lightning">
                ⚡
              </span>{' '}
              Quick Draft
            </Button>
            <Button
              variant="secondary"
              size="$5"
              onPress={() => handleQuickAction('teams')}
              flex={1}
              minWidth={150}
            >
              <span role="img" aria-label="people">
                👥
              </span>{' '}
              Manage Teams
            </Button>
            <Button
              variant="secondary"
              size="$5"
              onPress={() => navigate('/players/stats')}
              flex={1}
              minWidth={150}
            >
              <span role="img" aria-label="chart">
                📊
              </span>{' '}
              Player Stats
            </Button>
          </XStack>
        </YStack>

        {/* Sports Selection */}
        <YStack space="$4">
          <H2 size="$7" color="$color">
            Choose Your Sport
          </H2>
          <XStack space="$4" flexWrap="wrap">
            <Card
              title="Football"
              elevate
              size="$4"
              bordered
              flex={1}
              minWidth={160}
              backgroundColor="$color2"
              borderColor="$borderColor"
            >
              <YStack alignItems="center" space="$4">
                <Paragraph size="$8">
                  <span role="img" aria-label="football">
                    🏈
                  </span>
                </Paragraph>
                <Button variant="secondary" size="$4" disabled width="100%">
                  Coming Soon
                </Button>
              </YStack>
            </Card>

            <Card
              title="Baseball"
              elevate
              size="$4"
              bordered
              flex={1}
              minWidth={160}
              backgroundColor="$color2"
              borderColor="$borderColor"
              hoverStyle={{ backgroundColor: '$color3' }}
              pressStyle={{ backgroundColor: '$color4' }}
            >
              <YStack alignItems="center" space="$4">
                <Paragraph size="$8">
                  <span role="img" aria-label="baseball">
                    ⚾
                  </span>
                </Paragraph>
                <Button
                  variant="primary"
                  size="$4"
                  onPress={() => handleSportPress('baseball')}
                  width="100%"
                >
                  Enter Baseball
                </Button>
              </YStack>
            </Card>

            <Card
              title="Basketball"
              elevate
              size="$4"
              bordered
              flex={1}
              minWidth={160}
              backgroundColor="$color2"
              borderColor="$borderColor"
              hoverStyle={{ backgroundColor: '$color3' }}
              pressStyle={{ backgroundColor: '$color4' }}
            >
              <YStack alignItems="center" space="$4">
                <Paragraph size="$8">
                  <span role="img" aria-label="basketball">
                    🏀
                  </span>
                </Paragraph>
                <Button
                  variant="secondary"
                  size="$4"
                  onPress={() => handleQuickAction('coming-soon')}
                  width="100%"
                >
                  Coming Soon
                </Button>
              </YStack>
            </Card>
          </XStack>
        </YStack>

        {/* Features Overview */}
        <YStack space="$4">
          <H2 size="$7" color="$color">
            Platform Features
          </H2>
          <XStack space="$4" flexWrap="wrap">
            <YStack
              flex={1}
              minWidth={140}
              padding="$4"
              space="$2"
              backgroundColor="$color1"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Paragraph size="$6" textAlign="center">
                <span role="img" aria-label="trending up">
                  📈
                </span>
              </Paragraph>
              <H2 size="$5" color="$color" textAlign="center">
                Player Stats
              </H2>
              <Paragraph color="$colorPress" textAlign="center">
                Comprehensive player statistics and analytics
              </Paragraph>
            </YStack>

            <YStack
              flex={1}
              minWidth={140}
              padding="$4"
              space="$2"
              backgroundColor="$color1"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Paragraph size="$6" textAlign="center">
                <span role="img" aria-label="trophy">
                  🏆
                </span>
              </Paragraph>
              <H2 size="$5" color="$color" textAlign="center">
                Draft Tools
              </H2>
              <Paragraph color="$colorPress" textAlign="center">
                Advanced draft boards and team management
              </Paragraph>
            </YStack>

            <YStack
              flex={1}
              minWidth={140}
              padding="$4"
              space="$2"
              backgroundColor="$color1"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <Paragraph size="$6" textAlign="center">
                <span role="img" aria-label="lightning bolt">
                  ⚡
                </span>
              </Paragraph>
              <H2 size="$5" color="$color" textAlign="center">
                Real-time Data
              </H2>
              <Paragraph color="$colorPress" textAlign="center">
                Live updates and real-time statistics
              </Paragraph>
            </YStack>
          </XStack>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
