import { jiraRequest } from '../jira-api.js';

interface Sprint {
  id: number;
  name: string;
  state: string;
}

interface BoardSprintsResponse {
  values: Sprint[];
}

interface BoardSearchResponse {
  values: Array<{ id: number; name: string }>;
}

/**
 * Find the active sprint for the LS project board.
 *
 * Discovery order:
 * 1. Search for scrum boards belonging to the LS project
 * 2. Query the first board's sprints filtered to state=active
 * 3. Return the first (and typically only) active sprint ID
 *
 * Returns `null` if no active sprint is found.
 */
export async function getActiveSprintId(): Promise<number | null> {
  // Find the LS project board
  const boards = await jiraRequest<BoardSearchResponse>({
    method: 'GET',
    path: '/rest/agile/1.0/board',
    query: { projectKeyOrId: 'LS', type: 'scrum' },
  });

  if (!boards.values.length) {
    return null;
  }

  const boardId = boards.values[0].id;

  // Get the active sprint on that board
  const sprints = await jiraRequest<BoardSprintsResponse>({
    method: 'GET',
    path: `/rest/agile/1.0/board/${boardId}/sprint`,
    query: { state: 'active' },
  });

  if (!sprints.values.length) {
    return null;
  }

  return sprints.values[0].id;
}
