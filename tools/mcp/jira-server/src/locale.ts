/**
 * Locale-aware status matching for Jira Cloud.
 *
 * Jira Cloud localises status and transition names based on the site locale.
 * These mappings let us match English input against non-English instances
 * (e.g. a Chinese-locale Jira where "In Progress" becomes "正在进行").
 *
 * Keys are lowercase English; values are lowercase localized alternatives.
 * Only Jira's stock translations are listed — custom status names are matched
 * by exact (case-insensitive) comparison, which the caller should try first.
 */
const STATUS_ALIASES: Record<string, string[]> = {
  'to do': ['待办', 'à faire', 'zu erledigen', 'por hacer', 'em aberto'],
  'in progress': [
    '正在进行',
    'en cours',
    'in bearbeitung',
    'en progreso',
    'em andamento',
  ],
  'in review': [
    '审查中',
    '审核中',
    'en révision',
    'in überprüfung',
    'en revisión',
    'em revisão',
  ],
  done: ['已完成', '完成', 'terminé', 'fertig', 'listo', 'concluído'],
};

/** Check if a (possibly localized) name matches the expected English status. */
export function matchesStatus(
  localizedName: string,
  englishStatus: string,
): boolean {
  const lower = localizedName.toLowerCase();
  const target = englishStatus.toLowerCase();
  if (lower === target) return true;
  const aliases = STATUS_ALIASES[target];
  return aliases ? aliases.some((a) => lower === a) : false;
}
