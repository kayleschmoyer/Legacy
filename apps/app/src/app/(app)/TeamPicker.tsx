import React from 'react';
import { TeamType } from './DraftBoardPage';

type TeamPickerProps = {
  selectedTeam: number;
  teams: TeamType[];
  onSelect: (teamId: number) => void;
};

const TeamPicker: React.FC<TeamPickerProps> = ({
  selectedTeam,
  teams,
  onSelect,
}) => {
  return (
    <select
      value={selectedTeam}
      onChange={(e) => onSelect(Number(e.target.value))}
      className="team-picker"
    >
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
};

export default TeamPicker;
