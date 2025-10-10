import React, { useState } from 'react';
import { Button, Input, ScrollView, Spinner, Text, YStack } from 'tamagui';
import { Platform } from '../../platform-components';
import { Table } from '../../platform-components';
import { handleError } from '../../utils/ErrorHandler';

// API response interface
interface CareerStatsResponse {
  batting?: Record<string, string | number>;
  pitching?: Record<string, string | number>;
  fielding?: Record<string, string | number>;
}

// Cross-platform table implementation for career stats
interface CareerStatsTableProps {
  headers: string[];
  data: Array<Array<string | number>>;
  title: string;
}

const CareerStatsTable: React.FC<CareerStatsTableProps> = ({
  headers,
  data,
  title,
}) => {
  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          marginBottom: 24,
          backgroundColor: '#1a1a2e',
          borderRadius: '8px',
          padding: '16px',
          border: '1px solid #3a3a5a',
        }}
      >
        <h3
          style={{
            marginBottom: 16,
            color: '#bababaa',
            fontSize: '18px',
            fontWeight: '600',
          }}
        >
          {title}
        </h3>
        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            overflowX: 'auto',
            border: '1px solid #3a3a5a',
            borderRadius: '4px',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: '#0f0f23',
            }}
          >
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: 12,
                    border: '1px solid #3a3a5a',
                    backgroundColor: '#1a1a2e',
                    color: '#bababaa',
                    textAlign: 'left',
                    fontSize: 14,
                    fontWeight: 'bold',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    style={{
                      padding: 10,
                      border: '1px solid #3a3a5a',
                      fontSize: 13,
                      color: '#9a9aaa',
                      backgroundColor: '#0f0f23',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    );
  }

  // React Native implementation
  return (
    <YStack marginBottom="$4">
      <Table headers={headers} data={data} title={title} />
    </YStack>
  );
};

export interface CareerStatsViewerProps {
  /**
   * API endpoint for fetching career stats
   * @default 'http://localhost:5000/career-stats'
   */
  apiEndpoint?: string;
}

function CareerStatsViewer({
  apiEndpoint = process.env.VITE_STATS_API_URL ||
    'http://localhost:5000/career-stats',
}: CareerStatsViewerProps) {
  const [player, setPlayer] = useState('');
  const [loading, setLoading] = useState(false);
  const [battingStats, setBattingStats] = useState<
    Array<Array<string | number>>
  >([]);
  const [pitchingStats, setPitchingStats] = useState<
    Array<Array<string | number>>
  >([]);
  const [fieldingStats, setFieldingStats] = useState<
    Array<Array<string | number>>
  >([]);
  const [battingHeaders, setBattingHeaders] = useState<string[]>([]);
  const [pitchingHeaders, setPitchingHeaders] = useState<string[]>([]);
  const [fieldingHeaders, setFieldingHeaders] = useState<string[]>([]);

  const getCareerStats = async () => {
    if (!player.trim()) {
      alert('Please enter a player ID');
      return;
    }

    setLoading(true);
    try {
      // Use fetch for cross-platform compatibility
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_id: player,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as CareerStatsResponse;

      // Process batting stats
      if (data.batting) {
        const battingHeadersArray = Object.keys(data.batting);
        const battingDataArray = [Object.values(data.batting)];
        setBattingHeaders(battingHeadersArray);
        setBattingStats(battingDataArray);
      }

      // Process pitching stats
      if (data.pitching) {
        const pitchingHeadersArray = Object.keys(data.pitching);
        const pitchingDataArray = [Object.values(data.pitching)];
        setPitchingHeaders(pitchingHeadersArray);
        setPitchingStats(pitchingDataArray);
      }

      // Process fielding stats
      if (data.fielding) {
        const fieldingHeadersArray = Object.keys(data.fielding);
        const fieldingDataArray = [Object.values(data.fielding)];
        setFieldingHeaders(fieldingHeadersArray);
        setFieldingStats(fieldingDataArray);
      }
    } catch (error) {
      handleError(error);
      // Clear previous data on error
      setBattingStats([]);
      setPitchingStats([]);
      setFieldingStats([]);
      setBattingHeaders([]);
      setPitchingHeaders([]);
      setFieldingHeaders([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      <Text
        fontSize="$5"
        fontWeight="bold"
        marginBottom="$4"
        textAlign="center"
        color="$color12"
      >
        Player Career Stats
      </Text>

      <YStack
        marginBottom="$4"
        backgroundColor="$color2"
        padding="$4"
        borderRadius="$4"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <Text fontSize="$4" fontWeight="600" marginBottom="$2" color="$color11">
          Player ID:
        </Text>
        <Input
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$3"
          padding="$3"
          fontSize="$4"
          backgroundColor="$color1"
          color="$color12"
          value={player}
          onChangeText={setPlayer}
          placeholder="Enter player ID"
          placeholderTextColor="$color9"
          editable={!loading}
        />
      </YStack>

      <Button
        backgroundColor={loading ? '$color6' : '$blue10'}
        paddingVertical="$3"
        paddingHorizontal="$6"
        borderRadius="$3"
        alignItems="center"
        marginBottom="$4"
        onPress={() => void getCareerStats()}
        disabled={loading}
        opacity={loading ? 0.5 : 1}
      >
        {loading ? (
          <Spinner size="small" color="$white" />
        ) : (
          <Text color="$white" fontSize="$4" fontWeight="600">
            Get Career Stats
          </Text>
        )}
      </Button>

      {/* Batting Stats */}
      {battingStats.length > 0 && battingHeaders.length > 0 && (
        <CareerStatsTable
          title="Batting Stats"
          headers={battingHeaders}
          data={battingStats}
        />
      )}

      {/* Pitching Stats */}
      {pitchingStats.length > 0 && pitchingHeaders.length > 0 && (
        <CareerStatsTable
          title="Pitching Stats"
          headers={pitchingHeaders}
          data={pitchingStats}
        />
      )}

      {/* Fielding Stats */}
      {fieldingStats.length > 0 && fieldingHeaders.length > 0 && (
        <CareerStatsTable
          title="Fielding Stats"
          headers={fieldingHeaders}
          data={fieldingStats}
        />
      )}

      {!loading &&
        battingStats.length === 0 &&
        pitchingStats.length === 0 &&
        fieldingStats.length === 0 &&
        player && (
          <YStack
            backgroundColor="$color2"
            padding="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$borderColor"
            marginTop="$4"
          >
            <Text fontSize="$4" textAlign="center" color="$color10">
              No career stats found for this player.
            </Text>
          </YStack>
        )}
    </ScrollView>
  );
}

export { CareerStatsViewer };
export default CareerStatsViewer;
