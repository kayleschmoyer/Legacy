import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'tamagui';
import {
  JoinByCodeScreen,
  type JoinedTarget,
} from '@legacy-sports/shared-components/draft';
import { navigateFromModal } from '../../../common/utilities/RouteUtils';

/**
 * The universal invite route on native, (app)/join/[code] (LS-10078). A
 * /join/:code universal link lands here directly; legacy league and
 * mock-draft invite links are rewritten here by +native-intent.ts. The
 * shared screen previews the code (mock draft or league) before joining.
 */
function navigateToJoinedTarget(
  router: ReturnType<typeof useRouter>,
  target: JoinedTarget,
): void {
  if (target.kind === 'mock') {
    router.navigate({
      pathname: '/mock-draft/[draftId]',
      params: { draftId: String(target.draftId) },
    });
    return;
  }
  navigateFromModal(
    router,
    `/${target.sport}/league/${String(target.leagueId)}`,
  );
}

export default function JoinByCodeRoute(): React.JSX.Element {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const initialCode = Array.isArray(code) ? code[0] : code;

  const open = (target: JoinedTarget) => navigateToJoinedTarget(router, target);

  return (
    <ScrollView>
      <JoinByCodeScreen
        initialCode={initialCode}
        onJoined={open}
        onOpenExisting={open}
        onCancel={() => router.back()}
      />
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
