import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from '../../platform-components';
import { Table } from '../../platform-components';
import { handleError } from '../../utils/ErrorHandler';
import { safeStyle } from '../../utils/styles';

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
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16, color: '#333' }}>{title}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={{
                    padding: 8,
                    border: '1px solid #ddd',
                    backgroundColor: '#f5f5f5',
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
                      padding: 8,
                      border: '1px solid #ddd',
                      fontSize: 13,
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
    );
  }

  // React Native implementation
  return (
    <View style={styles.tableSection}>
      <Table headers={headers} data={data} title={title} />
    </View>
  );
};

export interface CareerStatsViewerProps {
  /**
   * API endpoint for fetching career stats
   * @default 'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/career-stats'
   */
  apiEndpoint?: string;
}

function CareerStatsViewer({
  apiEndpoint = 'https://e57xg24kgi.execute-api.us-east-1.amazonaws.com/default/career-stats',
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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Player Career Stats</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Player ID:</Text>
        <TextInput
          style={styles.input}
          value={player}
          onChangeText={setPlayer}
          placeholder="Enter player ID"
          editable={!loading}
        />
      </View>

      <TouchableOpacity
        style={safeStyle([styles.button, loading && styles.buttonDisabled])}
        onPress={getCareerStats}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Loading...' : 'Get Career Stats'}
        </Text>
      </TouchableOpacity>

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
          <Text style={styles.noDataText}>
            No career stats found for this player.
          </Text>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#333',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tableSection: {
    marginBottom: 24,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  noDataText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 20,
  },
  // React Native table fallback styles
  tableContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
  },
  headerCell: {
    flex: 1,
    padding: 6,
    fontWeight: 'bold',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    fontSize: 12,
  },
  dataRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  dataCell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    fontSize: 11,
  },
  // React Native table component styles
  header: {
    height: 40,
    backgroundColor: '#f5f5f5',
  },
  headerText: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 12,
  },
  row: {
    height: 30,
  },
  text: {
    textAlign: 'center',
    fontSize: 11,
  },
});

export { CareerStatsViewer };
export default CareerStatsViewer;
