/**
 * Web implementation of the "download draft packet" feature (LS-9750): the
 * CSV content itself is built platform-agnostically in
 * `@legacy-sports/shared-components` (see `buildDraftPacketCsv`); this just
 * turns that string into a browser download, mirroring `downloadJsonFile`
 * in `leagueSettingsExport.ts` (LS-9146).
 */
export function downloadCsvFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
