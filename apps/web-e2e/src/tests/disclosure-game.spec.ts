/**
 * E2E Tests: Progressive Disclosure Minigame (LS-2113)
 *
 * Tests the full game flow at /games/disclosure:
 *  - Idle screen renders "Start Game" button
 *  - Starting a game transitions to the playing phase
 *  - Next Clue reveals a clue card in the feed
 *  - Correct guess transitions to the result screen with score
 *  - Wrong guess shows an error and stays in the playing phase
 *  - Give Up reveals the correct player ID and transitions to result
 *
 * All GraphQL calls are mocked via route.fulfill() — no live backend needed.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ──────────────────────────────────────────────────────────────

const GAME_URL = '/games/disclosure';
const SESSION_ID = 42;
const TOTAL_CLUES = 5;
const CORRECT_PLAYER_ID = 123;
const CORRECT_PLAYER_NAME = 'Babe Ruth';

// ── Mock builders ──────────────────────────────────────────────────────────

function makeClue(index: number, isLast = false) {
  return {
    __typename: 'DisclosureClue',
    clueText: `Clue number ${index}`,
    difficultyTier: index <= 2 ? 'vague' : 'moderate',
    clueIndex: index,
    totalClues: TOTAL_CLUES,
    isLastClue: isLast,
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Sets up the stateful GraphQL mock layer for the disclosure game.
 * Registers routes BEFORE navigation so they intercept the initial load.
 */
async function setupDisclosureMocks(
  page: import('@playwright/test').Page,
  options: {
    /** Override the guess result — defaults to correct */
    guessCorrect?: boolean;
  } = {},
) {
  const { guessCorrect = true } = options;
  let clueIndex = 0;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('startdisclosuregame')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              startDisclosureGame: {
                __typename: 'StartDisclosureGameResult',
                sessionId: SESSION_ID,
                totalClues: TOTAL_CLUES,
              },
            },
          }),
        });
      } else if (postData.includes('nextclue')) {
        clueIndex += 1;
        const isLast = clueIndex >= TOTAL_CLUES;
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { nextClue: makeClue(clueIndex, isLast) },
          }),
        });
      } else if (postData.includes('submitguess')) {
        if (guessCorrect) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                submitGuess: {
                  __typename: 'DisclosureGuessResult',
                  correct: true,
                  score: 900,
                  correctPlayerId: null,
                  cluesUsed: clueIndex,
                },
              },
            }),
          });
        } else {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                submitGuess: {
                  __typename: 'DisclosureGuessResult',
                  correct: false,
                  score: 0,
                  correctPlayerId: null,
                  cluesUsed: clueIndex,
                },
              },
            }),
          });
        }
      } else if (postData.includes('giveupdisclosuregame')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              giveUpDisclosureGame: {
                __typename: 'GiveUpDisclosureGameResult',
                correctPlayerId: CORRECT_PLAYER_ID,
              },
            },
          }),
        });
      } else if (postData.includes('searchplayersfordisclosure')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              searchPlayers: [
                {
                  __typename: 'Player',
                  id: CORRECT_PLAYER_ID,
                  firstName: 'Babe',
                  lastName: 'Ruth',
                },
                {
                  __typename: 'Player',
                  id: 456,
                  firstName: 'Mickey',
                  lastName: 'Mantle',
                },
              ],
            },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    },
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Progressive Disclosure Game @minigame', () => {
  test('idle screen renders Start Game button', async ({ page }) => {
    await setupDisclosureMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('disclosure-game-idle')).toBeVisible();
    await expect(page.getByTestId('start-game-button')).toBeVisible();
    await expect(page.getByTestId('start-game-button')).toHaveText(
      'Start Game',
    );
  });

  test('starting a game shows the playing phase', async ({ page }) => {
    await setupDisclosureMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();

    await expect(page.getByTestId('disclosure-game-playing')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('clue-counter')).toContainText(
      `0 / ${TOTAL_CLUES}`,
    );
  });

  test('Next Clue reveals a clue card in the feed', async ({ page }) => {
    await setupDisclosureMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();

    await page.getByTestId('next-clue-button').click();

    await expect(page.getByTestId('clue-1')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('clue-1')).toContainText('Clue number 1');
    await expect(page.getByTestId('clue-counter')).toContainText(
      `1 / ${TOTAL_CLUES}`,
    );
  });

  test('correct guess → result screen with score', async ({ page }) => {
    await setupDisclosureMocks(page, { guessCorrect: true });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    // Start and reveal one clue
    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();
    await page.getByTestId('next-clue-button').click();
    await page.getByTestId('clue-1').waitFor();

    // Type player name to trigger autocomplete
    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();

    // Submit guess
    await page.getByTestId('submit-guess-button').click();

    // Should show result screen
    await expect(page.getByTestId('disclosure-game-result')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('result-headline')).toContainText('Correct');
    await expect(page.getByTestId('result-score')).toContainText('900');
  });

  test('wrong guess shows error and stays in playing phase', async ({
    page,
  }) => {
    await setupDisclosureMocks(page, { guessCorrect: false });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();
    await page.getByTestId('next-clue-button').click();
    await page.getByTestId('clue-1').waitFor();

    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();
    await page.getByTestId('submit-guess-button').click();

    // Should stay in playing phase and show error
    await expect(page.getByTestId('disclosure-game-playing')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('error-message')).toBeVisible();
    await expect(page.getByTestId('error-message')).toContainText(
      'Wrong guess',
    );
  });

  test('give up reveals correct player and transitions to result', async ({
    page,
  }) => {
    await setupDisclosureMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();
    await page.getByTestId('next-clue-button').click();
    await page.getByTestId('clue-1').waitFor();

    await page.getByTestId('give-up-button').click();

    await expect(page.getByTestId('disclosure-game-result')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('result-headline')).toContainText(
      'Better luck',
    );
    await expect(page.getByTestId('result-correct-player')).toContainText(
      String(CORRECT_PLAYER_ID),
    );
  });

  test('out of clues — wrong guess after all clues revealed transitions to lost result', async ({
    page,
  }) => {
    // Custom mock: reveal all TOTAL_CLUES clues, then submit a wrong guess
    // that returns isLastClue: true to trigger the lost path.
    let clueIndex = 0;

    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';

        if (postData.includes('startdisclosuregame')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                startDisclosureGame: {
                  __typename: 'StartDisclosureGameResult',
                  sessionId: SESSION_ID,
                  totalClues: TOTAL_CLUES,
                },
              },
            }),
          });
        } else if (postData.includes('nextclue')) {
          clueIndex += 1;
          const isLast = clueIndex >= TOTAL_CLUES;
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: { nextClue: makeClue(clueIndex, isLast) },
            }),
          });
        } else if (postData.includes('submitguess')) {
          // Wrong guess after all clues revealed — server signals isLastClue
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                submitGuess: {
                  __typename: 'DisclosureGuessResult',
                  correct: false,
                  score: 0,
                  correctPlayerId: CORRECT_PLAYER_ID,
                  cluesUsed: TOTAL_CLUES,
                },
              },
            }),
          });
        } else if (postData.includes('searchplayersfordisclosure')) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                searchPlayers: [
                  {
                    __typename: 'Player',
                    id: CORRECT_PLAYER_ID,
                    firstName: 'Babe',
                    lastName: 'Ruth',
                  },
                ],
              },
            }),
          });
        } else {
          await unmockedGraphQLFallback(route);
        }
      },
    );

    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    // Start game
    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();

    // Reveal all clues
    for (let i = 1; i <= TOTAL_CLUES; i++) {
      await page.getByTestId('next-clue-button').click();
      await page.getByTestId(`clue-${i}`).waitFor({ timeout: 5000 });
    }

    // Confirm clue counter shows all clues used
    await expect(page.getByTestId('clue-counter')).toContainText(
      `${TOTAL_CLUES} / ${TOTAL_CLUES}`,
    );

    // Type and select a player
    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();

    // Submit wrong guess
    await page.getByTestId('submit-guess-button').click();

    // Should transition to result screen with "Out of clues" (lost) outcome
    await expect(page.getByTestId('disclosure-game-result')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('result-headline')).toContainText(
      'Out of clues',
    );
    await expect(page.getByTestId('result-correct-player')).toContainText(
      String(CORRECT_PLAYER_ID),
    );
  });

  test('Play Again returns to idle screen', async ({ page }) => {
    await setupDisclosureMocks(page, { guessCorrect: true });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('disclosure-game-playing').waitFor();
    await page.getByTestId('next-clue-button').click();
    await page.getByTestId('clue-1').waitFor();

    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();
    await page.getByTestId('submit-guess-button').click();
    await page.getByTestId('disclosure-game-result').waitFor();

    await page.getByTestId('play-again-button').click();

    await expect(page.getByTestId('disclosure-game-idle')).toBeVisible({
      timeout: 3000,
    });
  });
});
