/** problems.json 生成時のエスケープ差分を吸収 */
export function normalizeMultiline(s: string): string {
  return s.replace(/\\n/g, "\n");
}
