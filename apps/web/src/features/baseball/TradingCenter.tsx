/**
 * TradingCenter — web wrapper that wires the shared-components TradingCenter
 * to the web-specific LeagueWebSocket for real-time trade updates.
 */
import React, { useCallback, useRef } from 'react';
import {
  TradingCenter as SharedTradingCenter,
  type TradingCenterProps as SharedTradingCenterProps,
} from '@legacy-sports/shared-components/leagues';
import { useLeagueWebSocket } from '../../hooks/useLeagueWebSocket';

export type TradingCenterProps = Omit<
  SharedTradingCenterProps,
  'onSubscribeRefresh'
>;

export function TradingCenter(props: TradingCenterProps): React.JSX.Element {
  const refetchRef = useRef<(() => void) | null>(null);

  useLeagueWebSocket({
    onTradeOffer: () => refetchRef.current?.(),
    onRosterUpdate: () => refetchRef.current?.(),
  });

  const onSubscribeRefresh = useCallback((refetch: () => void) => {
    refetchRef.current = refetch;
    return () => {
      refetchRef.current = null;
    };
  }, []);

  return (
    <SharedTradingCenter {...props} onSubscribeRefresh={onSubscribeRefresh} />
  );
}
