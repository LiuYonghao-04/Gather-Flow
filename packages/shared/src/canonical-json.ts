/** Stable JSON for request comparison. Array order remains meaningful. */
export function canonicalJson(value: unknown): string {
  const result = JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
  if (result === undefined) throw new Error('无法序列化提交内容');
  return result;
}
