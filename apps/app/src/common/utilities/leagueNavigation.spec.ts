import {
  BackCapableRouter,
  goBackToApp,
  LEAGUES_TAB_ROUTE,
} from './leagueNavigation';

function makeRouter(canGoBack: boolean): jest.Mocked<BackCapableRouter> {
  return {
    canGoBack: jest.fn(() => canGoBack),
    back: jest.fn(),
    navigate: jest.fn(),
  };
}

describe('goBackToApp', () => {
  it('pops the stack when there is somewhere to go back to', () => {
    const router = makeRouter(true);
    goBackToApp(router);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates to the Leagues tab when the league is the stack root', () => {
    const router = makeRouter(false);
    goBackToApp(router);
    expect(router.navigate).toHaveBeenCalledWith(LEAGUES_TAB_ROUTE);
    expect(router.back).not.toHaveBeenCalled();
  });
});
