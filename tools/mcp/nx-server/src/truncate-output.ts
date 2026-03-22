export const MAX_OUTPUT_CHARS = 30_000;

export function truncateOutput(
  output: string,
  maxChars: number = MAX_OUTPUT_CHARS,
): string {
  if (output.length <= maxChars) return output;
  const headSize = Math.floor(maxChars * 0.3);
  const tailSize = Math.floor(maxChars * 0.7);
  const head = output.slice(0, headSize);
  const tail = output.slice(-tailSize);
  const omitted = output.length - headSize - tailSize;
  const result = `${head}\n\n... [${omitted.toLocaleString()} characters omitted] ...\n\n${tail}`;
  return result.length > maxChars ? result.slice(0, maxChars) : result;
}
