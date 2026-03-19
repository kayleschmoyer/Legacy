import React from 'react';
import { Card, H4, Spinner, Text, YStack } from 'tamagui';
import { useGetCommissionerAuditLogsQuery } from '../../api/db/graphql.generated';

export interface CommissionerAuditLogProps {
  leagueId: number;
  limit?: number;
}

/**
 * CommissionerAuditLog - Displays a log of all commissioner actions.
 * Cross-platform: Tamagui only, no web-specific APIs.
 */
export function CommissionerAuditLog({
  leagueId,
  limit = 20,
}: CommissionerAuditLogProps) {
  const { data, loading, error } = useGetCommissionerAuditLogsQuery({
    variables: { leagueId, limit },
    fetchPolicy: 'cache-and-network',
  });

  const logs = [...(data?.commissionerAuditLogs ?? [])].sort((a, b) => {
    const dateA = a.createdAt ? new Date(String(a.createdAt)).getTime() : 0;
    const dateB = b.createdAt ? new Date(String(b.createdAt)).getTime() : 0;
    return dateB - dateA;
  });

  return (
    <Card backgroundColor="$gray2" borderColor="$gray6" padding="$4">
      <YStack space="$3">
        <H4>Audit Log</H4>
        <Text color="$gray11" fontSize="$3">
          Recent commissioner actions for this league.
        </Text>

        {loading && logs.length === 0 && <Spinner />}

        {error && (
          <Text color="$red10" fontSize="$3">
            Failed to load audit log
          </Text>
        )}

        {!loading && logs.length === 0 && (
          <Text color="$gray10" fontSize="$3">
            No commissioner actions recorded yet.
          </Text>
        )}

        {logs.map((log) => (
          <Card
            key={log.id}
            backgroundColor="$gray3"
            padding="$3"
            borderRadius="$3"
          >
            <YStack space="$1">
              <Text fontSize="$3" fontWeight="600">
                {log.action}
              </Text>
              {log.reason && (
                <Text fontSize="$2" color="$gray11">
                  Reason: {log.reason}
                </Text>
              )}
              <Text fontSize="$2" color="$gray10">
                {log.createdAt
                  ? new Date(String(log.createdAt)).toLocaleString()
                  : ''}
              </Text>
            </YStack>
          </Card>
        ))}
      </YStack>
    </Card>
  );
}
