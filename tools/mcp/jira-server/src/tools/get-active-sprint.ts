import { searchJql } from '../jql-search.js';

/**
 * Sprint field value shape returned by Jira's REST API v3.
 * The `sprint` field (customfield_10020) returns an array of sprint objects.
 */
interface SprintFieldValue {
  id: number;
  name: string;
  state: string;
}

interface SprintSearchFields {
  /** The API may return a single object or an array of sprint objects. */
  sprint: SprintFieldValue | SprintFieldValue[] | null;
  /** Some Jira instances return sprint in customfield_10020 instead. */
  customfield_10020?: SprintFieldValue[] | null;
}

/**
 * Find the active sprint for the LS project using the platform API (JQL search).
 *
 * Strategy: search for any LS issue currently in an active sprint, then extract
 * the sprint ID from its sprint field. This avoids the Agile REST API which
 * requires Jira Software OAuth scopes that may not be available.
 *
 * Returns `null` if no active sprint is found.
 */
export async function getActiveSprintId(): Promise<number | null> {
  const result = await searchJql<SprintSearchFields>({
    jql: 'project = LS AND sprint in openSprints() ORDER BY created DESC',
    fields: ['sprint', 'customfield_10020'],
    maxResults: 1,
  });

  if (!result.issues.length) {
    return null;
  }

  const fields = result.issues[0].fields;

  // Try the `sprint` field first, then fall back to customfield_10020.
  // The API may return a single object or an array — normalise to array.
  if (fields.sprint) {
    const sprintArr = Array.isArray(fields.sprint)
      ? fields.sprint
      : [fields.sprint];
    const active = sprintArr.find((s) => s.state === 'active');
    if (active) {
      return active.id;
    }
  }

  const sprints = fields.customfield_10020;
  if (sprints?.length) {
    const active = sprints.find((s) => s.state === 'active');
    if (active) {
      return active.id;
    }
  }

  return null;
}
