import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { YStack, Text, Button, Spinner } from 'tamagui';
import { useGetLeagueTeamsQuery, useGetTeamMembersQuery, useGetUserTeamIdQuery } from '../../api/db/graphql.generated';

/**
 * TeamDetailPage - Display team roster and allow editing for team owners
 */
export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const teamIdNum = parseInt(teamId || '0');
  
  // Get team members (which includes leagueId)
  const { data: membersData, loading: membersLoading, error: membersError } = useGetTeamMembersQuery({
    variables: { teamId: teamIdNum },
    skip: !teamId,
  });

  // Get team details from leagueTeams query
  const leagueId = membersData?.teamMembers?.[0]?.leagueId;
  const { data: teamsData, loading: teamsLoading } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  // Get user's team in this league to check ownership
  const { data: userTeamData, loading: userTeamLoading } = useGetUserTeamIdQuery({
    variables: { leagueId: leagueId || 0 },
    skip: !leagueId,
  });

  const isOwner = userTeamData?.userTeamId === teamIdNum;
  const loading = membersLoading || teamsLoading || userTeamLoading;
  
  if (loading) return <Spinner />;
  if (membersError) return <Text>Error loading team: {membersError.message}</Text>;
  if (!membersData?.teamMembers) return <Text>Team not found</Text>;

  // Find the team from leagueTeams
  const team = teamsData?.leagueTeams?.find((t) => t?.id === teamIdNum);
  const teamMembers = membersData.teamMembers;

  return (
    <YStack padding="$4" gap="$4">
      <Button onPress={() => navigate(-1)}>Back</Button>
      
      <YStack gap="$2">
        <Text fontSize="$8" fontWeight="bold">{team?.name || 'Team'}</Text>
        {leagueId && <Text fontSize="$4">League ID: {leagueId}</Text>}
        {!isOwner && (
          <Text fontSize="$3" color="$gray11" fontStyle="italic">
            You are viewing this team as a visitor. Only the team owner can make changes.
          </Text>
        )}
      </YStack>

      <YStack gap="$3">
        <Text fontSize="$6" fontWeight="bold">Roster</Text>
        {teamMembers.map((member) => member && (
          <YStack key={member.id} padding="$3" backgroundColor="$gray2" borderRadius="$4">
            <Text fontWeight="bold">
              {member.player?.firstName} {member.player?.lastName}
            </Text>
            <Text fontSize="$2" color="$gray11">
              Position ID: {member.positionId || 'None'}
            </Text>
          </YStack>
        ))}
      </YStack>
    </YStack>
  );
}
