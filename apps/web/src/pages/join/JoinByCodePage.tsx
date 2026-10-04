import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  JoinByCodeScreen,
  type JoinedTarget,
} from '@legacy-sports/shared-components/draft';
import { joinedTargetPath } from './joinedTargetPath';
import { PageMeta } from '../../components/PageMeta';
import { storeCameFrom } from '../../lib/came-from';

/**
 * The universal join route, /join/:code (LS-10078). One link and one code
 * box for every kind of invite: the shared screen previews whether the code
 * opens a mock-draft lobby or a league, then joins it. Legacy
 * /baseball/mock-draft/join links redirect here.
 */
export function JoinByCodePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { code } = useParams<{ code?: string }>();

  const open = (target: JoinedTarget) => {
    navigate(joinedTargetPath(target));
  };

  return (
    <>
      <PageMeta
        title="Join with an invite code"
        description="Join a Legacy Sports league or mock draft with an invite code."
      />
      <JoinByCodeScreen
        initialCode={code}
        onJoined={open}
        onOpenExisting={open}
        onCancel={() => navigate('/')}
        onSignIn={() => {
          storeCameFrom(code ? `/join/${code}` : '/join');
          navigate('/login', { replace: true });
        }}
      />
    </>
  );
}
