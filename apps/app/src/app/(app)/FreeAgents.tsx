import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Modal,
  IconButton,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';

interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  battingAvg: number;
  homeRuns: number;
  rbis: number;
  steals: number;
  era: number;
  whip: number;
  wins: number;
  strikeouts: number;
  saves: number;
  obp: number;
  aiPotentialScore: number;
}

const FreeAgents: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Mock players data (10 players with comprehensive stats)
  const fetchFreeAgents = useCallback(() => {
    const mockPlayers: Player[] = [
      { id: '1', name: 'John Doe', position: 'P', team: 'NYM', battingAvg: 0.285, homeRuns: 15, rbis: 60, steals: 5, era: 2.87, whip: 1.05, wins: 10, strikeouts: 150, saves: 5, obp: 0.390, aiPotentialScore: 85 },
      { id: '2', name: 'Babe Ruth', position: 'OF', team: 'NYY', battingAvg: 0.342, homeRuns: 60, rbis: 171, steals: 10, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.474, aiPotentialScore: 99 },
      { id: '3', name: 'Ty Cobb', position: 'CF', team: 'DET', battingAvg: 0.366, homeRuns: 10, rbis: 120, steals: 50, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.433, aiPotentialScore: 90 },
      { id: '4', name: 'Hank Aaron', position: 'RF', team: 'ATL', battingAvg: 0.305, homeRuns: 40, rbis: 130, steals: 20, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.374, aiPotentialScore: 92 },
      { id: '5', name: 'Willie Mays', position: 'CF', team: 'SF', battingAvg: 0.302, homeRuns: 52, rbis: 140, steals: 30, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.384, aiPotentialScore: 91 },
      { id: '6', name: 'Mickey Mantle', position: 'OF', team: 'NYY', battingAvg: 0.298, homeRuns: 50, rbis: 130, steals: 15, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.421, aiPotentialScore: 89 },
      { id: '7', name: 'Ted Williams', position: 'LF', team: 'BOS', battingAvg: 0.344, homeRuns: 48, rbis: 145, steals: 5, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.482, aiPotentialScore: 98 },
      { id: '8', name: 'Joe DiMaggio', position: 'OF', team: 'NYY', battingAvg: 0.325, homeRuns: 45, rbis: 125, steals: 10, era: 0, whip: 0, wins: 0, strikeouts: 0, saves: 0, obp: 0.398, aiPotentialScore: 93 },
      { id: '9', name: 'Nolan Ryan', position: 'P', team: 'TEX', battingAvg: 0.110, homeRuns: 0, rbis: 5, steals: 0, era: 3.19, whip: 1.20, wins: 15, strikeouts: 300, saves: 2, obp: 0.190, aiPotentialScore: 88 },
      { id: '10', name: 'Greg Maddux', position: 'P', team: 'ATL', battingAvg: 0.150, homeRuns: 0, rbis: 10, steals: 0, era: 2.18, whip: 1.01, wins: 20, strikeouts: 220, saves: 0, obp: 0.200, aiPotentialScore: 94 },
    ];
    setPlayers(mockPlayers);
  }, []);

  useEffect(() => {
    fetchFreeAgents();
  }, [fetchFreeAgents]);

  const handleAddToTeam = (playerId: string) => {
    const updatedPlayers = players.filter((player) => player.id !== playerId);
    setPlayers(updatedPlayers);
  };

  const openPlayerCard = (player: Player) => {
    setSelectedPlayer(player);
    setModalVisible(true);
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'team', headerName: 'Team', width: 100 },
    { field: 'position', headerName: 'Position', width: 100 },
    { field: 'battingAvg', headerName: 'AVG', width: 100, type: 'number' },
    { field: 'homeRuns', headerName: 'HR', width: 80, type: 'number' },
    { field: 'rbis', headerName: 'RBIs', width: 80, type: 'number' },
    { field: 'steals', headerName: 'Steals', width: 80, type: 'number' },
    { field: 'era', headerName: 'ERA', width: 80, type: 'number' },
    { field: 'whip', headerName: 'WHIP', width: 80, type: 'number' },
    { field: 'wins', headerName: 'Wins', width: 80, type: 'number' },
    { field: 'strikeouts', headerName: 'Ks', width: 80, type: 'number' },
    { field: 'saves', headerName: 'Saves', width: 80, type: 'number' },
    { field: 'obp', headerName: 'OBP', width: 100, type: 'number' },
    { field: 'aiPotentialScore', headerName: 'AI Potential', width: 130, type: 'number' },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params) => (
        <IconButton color="primary" onClick={() => handleAddToTeam(params.id as string)}>
          <AddIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <Box sx={{ height: 600, width: '100%' }}>
      <TextField
        label="Search Players"
        variant="outlined"
        fullWidth
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ marginBottom: 2, backgroundColor: '#1c1c1c', color: '#fff' }}
        InputLabelProps={{ style: { color: '#fff' } }}
        InputProps={{
          style: { color: '#fff' },
        }}
      />

      <DataGrid
        rows={players.filter((player) =>
          player.name.toLowerCase().includes(searchQuery.toLowerCase())
        )}
        columns={columns}
        paginationModel={{ pageSize: 10, page: 0 }}
        pageSizeOptions={[10]}
        checkboxSelection={false}
        disableRowSelectionOnClick
        sx={{
          '& .MuiDataGrid-row': {
            backgroundColor: '#1c1c1c',
            color: '#fff',
          },
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: '#333',
            color: '#fff',
            fontSize: '14px',
            borderBottom: '1px solid #444',
          },
          '& .MuiDataGrid-cell': {
            color: '#fff',
          },
        }}
      />

      {selectedPlayer && (
        <Modal
          open={modalVisible}
          onClose={() => setModalVisible(false)}
        >
          <Box sx={styles.modalContainer}>
            <IconButton
              onClick={() => setModalVisible(false)}
              sx={{ position: 'absolute', top: 10, right: 10 }}
            >
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" sx={{ marginBottom: 2 }}>
              {selectedPlayer.name}
            </Typography>
            <Typography>Position: {selectedPlayer.position}</Typography>
            <Typography>Team: {selectedPlayer.team}</Typography>
            <Typography>Batting Avg: {selectedPlayer.battingAvg}</Typography>
            <Typography>Home Runs: {selectedPlayer.homeRuns}</Typography>
            <Typography>RBIs: {selectedPlayer.rbis}</Typography>
            <Typography>Steals: {selectedPlayer.steals}</Typography>
            <Typography>ERA: {selectedPlayer.era}</Typography>
            <Typography>WHIP: {selectedPlayer.whip}</Typography>
            <Typography>Wins: {selectedPlayer.wins}</Typography>
            <Typography>Strikeouts: {selectedPlayer.strikeouts}</Typography>
            <Typography>Saves: {selectedPlayer.saves}</Typography>
            <Typography>OBP: {selectedPlayer.obp}</Typography>
            <Typography>AI Potential Score: {selectedPlayer.aiPotentialScore}</Typography>

            <Button variant="contained" onClick={() => setModalVisible(false)} sx={{ marginTop: 2 }}>
              Close
            </Button>
          </Box>
        </Modal>
      )}
    </Box>
  );
};

const styles = {
  modalContainer: {
    position: 'relative',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: '50%',
    maxWidth: 400,
    margin: 'auto',
    marginTop: '10%',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
  },
};

export default FreeAgents;
