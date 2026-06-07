/**
 * E2E Tests: Twenty Questions Minigame (LS-7730)
 *
 * Tests the full game flow at /games/twenty-questions:
 *  - Entry screen renders "Start Game" button
 *  - Starting a game transitions to the playing phase
 *  - Asking a question updates the question counter
 *  - Correct guess transitions to the result screen with "You got it!" and tokens
 *  - Wrong guess shows an error and stays in the playing phase
 *  - Abandon game transitions to the result screen
 *  - Play Again returns to the entry screen
 *
 * All GraphQL calls are mocked via route.fulfill() — no live backend needed.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Constants ──────────────────────────────────────────────────────────────

const GAME_URL = '/games/twenty-questions';
const GAME_ID = 'game-abc-123';
const CORRECT_PLAYER_ID = 42;
const CORRECT_PLAYER_FIRST = 'Babe';
const CORRECT_PLAYER_LAST = 'Ruth';
const TOKENS_EARNED = 18;
const MAX_QUESTIONS = 20;

// ── Mock builders ──────────────────────────────────────────────────────────

function makeGameState(overrides: Record<string, unknown> = {}) {
  return {
    __typename: 'TwentyQuestionsGame',
    id: GAME_ID,
    status: 'active',
    difficulty: 'medium',
    sport: 'baseball',
    questionsUsed: 0,
    maxQuestions: MAX_QUESTIONS,
    tokensEarned: null,
    questions: [],
    targetPlayer: null,
    ...overrides,
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

async function setupTwentyQuestionsMocks(
  page: import('@playwright/test').Page,
  options: {
    guessCorrect?: boolean;
  } = {},
) {
  const { guessCorrect = true } = options;
  let questionsAsked = 0;

  await page.route(
    (url) => isGraphQLEndpoint(url),
    async (route) => {
      const op = extractOperationName(route).toLowerCase();

      if (op === 'twentyquestionsactivegame') {
        // No active game on mount — show entry screen fresh.
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { twentyQuestionsActiveGame: null } }),
        });
      } else if (op === 'twentyquestionsstart') {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { twentyQuestionsStart: makeGameState() },
          }),
        });
      } else if (op === 'twentyquestionsask') {
        questionsAsked += 1;
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              twentyQuestionsAsk: makeGameState({
                questionsUsed: questionsAsked,
                questions: [
                  {
                    questionNumber: questionsAsked,
                    category: 'position',
                    parameter: '{"position":"C"}',
                    answer: true,
                    isGuess: false,
                  },
                ],
              }),
            },
          }),
        });
      } else if (op === 'twentyquestionsguess') {
        if (guessCorrect) {
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                twentyQuestionsGuess: makeGameState({
                  status: 'won',
                  questionsUsed: questionsAsked,
                  tokensEarned: TOKENS_EARNED,
                  targetPlayer: {
                    id: CORRECT_PLAYER_ID,
                    firstName: CORRECT_PLAYER_FIRST,
                    lastName: CORRECT_PLAYER_LAST,
                    eligiblePositions: ['C'],
                  },
                }),
              },
            }),
          });
        } else {
          // Wrong guess — server returns the same active game state
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                twentyQuestionsGuess: makeGameState({
                  questionsUsed: questionsAsked,
                }),
              },
            }),
          });
        }
      } else if (op === 'twentyquestionsabandon') {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              twentyQuestionsAbandon: makeGameState({
                status: 'abandoned',
                questionsUsed: questionsAsked,
                targetPlayer: {
                  id: CORRECT_PLAYER_ID,
                  firstName: CORRECT_PLAYER_FIRST,
                  lastName: CORRECT_PLAYER_LAST,
                  eligiblePositions: ['C'],
                },
              }),
            },
          }),
        });
      } else if (op === 'searchplayersfortwentyquestions') {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              searchPlayers: [
                {
                  __typename: 'Player',
                  id: CORRECT_PLAYER_ID,
                  firstName: CORRECT_PLAYER_FIRST,
                  lastName: CORRECT_PLAYER_LAST,
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

test.describe('Twenty Questions Game @minigame', () => {
  test('entry screen renders Start Game button', async ({ page }) => {
    await setupTwentyQuestionsMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('twenty-questions-entry')).toBeVisible();
    await expect(page.getByTestId('start-game-button')).toBeVisible();
    await expect(page.getByTestId('start-game-button')).toHaveText(
      'Start Game',
    );
  });

  test('starting a game shows the playing phase', async ({ page }) => {
    await setupTwentyQuestionsMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();

    await expect(page.getByTestId('twenty-questions-playing')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('question-counter')).toContainText(
      `0 / ${MAX_QUESTIONS}`,
    );
  });

  test('asking a question updates the question counter', async ({ page }) => {
    await setupTwentyQuestionsMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('twenty-questions-playing').waitFor();

    // Select Position category and ask
    await page.getByTestId('category-position').click();
    await page.getByTestId('position-C').click();
    await page.getByTestId('ask-question-button').click();

    await expect(page.getByTestId('question-counter')).toContainText(
      `1 / ${MAX_QUESTIONS}`,
      { timeout: 5000 },
    );
  });

  test('correct guess → result screen with tokens and player reveal', async ({
    page,
  }) => {
    await setupTwentyQuestionsMocks(page, { guessCorrect: true });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('twenty-questions-playing').waitFor();

    // Type player name to trigger autocomplete, then submit
    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();
    await page.getByTestId('submit-guess-button').click();

    await expect(page.getByTestId('twenty-questions-result')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('result-headline')).toContainText(
      'You got it!',
    );
    await expect(page.getByTestId('target-player-name')).toContainText(
      `${CORRECT_PLAYER_FIRST} ${CORRECT_PLAYER_LAST}`,
    );
    await expect(page.getByTestId('tokens-earned')).toContainText(
      `+${TOKENS_EARNED}`,
    );
  });

  test('wrong guess shows error and stays in playing phase', async ({
    page,
  }) => {
    await setupTwentyQuestionsMocks(page, { guessCorrect: false });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('twenty-questions-playing').waitFor();

    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();
    await page.getByTestId('submit-guess-button').click();

    await expect(page.getByTestId('twenty-questions-playing')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('error-message')).toBeVisible();
    await expect(page.getByTestId('error-message')).toContainText(
      'Wrong guess',
    );
  });

  test('abandon game → result screen with player reveal', async ({ page }) => {
    await setupTwentyQuestionsMocks(page);
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('twenty-questions-playing').waitFor();

    await page.getByTestId('abandon-button').click();

    await expect(page.getByTestId('twenty-questions-result')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('result-headline')).toContainText(
      'Better luck next time',
    );
    await expect(page.getByTestId('target-player-name')).toContainText(
      `${CORRECT_PLAYER_FIRST} ${CORRECT_PLAYER_LAST}`,
    );
  });

  test('Play Again returns to entry screen', async ({ page }) => {
    await setupTwentyQuestionsMocks(page, { guessCorrect: true });
    await page.goto(GAME_URL);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('start-game-button').click();
    await page.getByTestId('twenty-questions-playing').waitFor();

    await page.getByTestId('guess-input').fill('Babe');
    await page.getByTestId('player-suggestions').waitFor({ timeout: 5000 });
    await page.getByTestId(`suggestion-${CORRECT_PLAYER_ID}`).click();
    await page.getByTestId('submit-guess-button').click();
    await page.getByTestId('twenty-questions-result').waitFor();

    await page.getByTestId('play-again-button').click();

    await expect(page.getByTestId('twenty-questions-entry')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByTestId('start-game-button')).toBeVisible();
  });
});
