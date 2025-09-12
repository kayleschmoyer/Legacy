import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Player } from './DraftBoardPage';

const PlayerRow: React.FC<{
  player: Player;
  onDraft: (player: Player) => void;
}> = ({ player, onDraft }) => {
  return (
    <TouchableOpacity onPress={() => onDraft(player)} style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.tableCellTextLeft]}>
        {player.player}
      </Text>
      <Text style={styles.tableCell}>{player.pos}</Text>
      <Text style={[styles.tableCell, styles.tableCellTextLeft]}>
        {player.team}
      </Text>
      <Text style={styles.tableCell}>{player.hr}</Text>
      <Text style={styles.tableCell}>{player.avg}</Text>
      <Text style={styles.tableCell}>{player.rbi}</Text>
      <Text style={[styles.tableCell, styles.tableCellTextLeft]}>
        {player.legacy}
      </Text>
      <Text style={styles.tableCell}>{player.fantasyPoints}</Text>
      <Text style={styles.tableCell}>{player.projectedPoints}</Text>
      <Text style={styles.tableCell}>{player.gamesPlayed}</Text>
      <Text style={styles.tableCell}>{player.runs}</Text>
      <Text style={styles.tableCell}>{player.hits}</Text>
      <Text style={styles.tableCell}>{player.strikeouts}</Text>
      <Text style={styles.tableCell}>{player.walks}</Text>
      <Text style={styles.tableCell}>{player.obp}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tableCell: {
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomWidth: 1,
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
    padding: 10,
    textAlign: 'center',
  },
  tableCellTextLeft: {
    textAlign: 'left',
  },
  tableRow: {
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default PlayerRow;
