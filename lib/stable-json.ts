/**
 * The canonical JSON every committed data file is written in, and the content key a fetch script
 * compares files by.
 *
 * Byte-identical output is the contract: a scheduled run over unchanged upstream data must write
 * exactly the bytes already committed, so the cron has nothing to commit. One walk (normalizeKeys)
 * sorts keys at every level and drops `undefined`, so data/snapshot.json (lib/pipeline), the
 * rosters and player-stats files (scripts/fetch-rosters.ts, scripts/fetch-player-stats.ts) and the
 * history archive (scripts/build-history.ts) are all written, and compared, the same way.
 *
 * Pure, with no imports.
 */

/**
 * `value` with keys sorted at every level, every `undefined` value and every key in `ignore`
 * dropped. Throws on a cycle (an object that contains itself); an object merely referenced twice is
 * walked twice, as JSON.stringify would.
 */
export function normalizeKeys(value: unknown, ignore: readonly string[] = []): unknown {
  const ancestors = new WeakSet<object>();
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      if (ancestors.has(node)) throw new Error('circular structure');
      ancestors.add(node);
      const out = node.map(normalize);
      ancestors.delete(node);
      return out;
    }
    if (node && typeof node === 'object') {
      if (ancestors.has(node)) throw new Error('circular structure');
      ancestors.add(node);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        if (ignore.includes(key)) continue;
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      ancestors.delete(node);
      return out;
    }
    return node;
  };
  return normalize(value);
}

/** Keys sorted at every level, two-space indent and a final newline, so a git diff shows only what really changed. */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(normalizeKeys(value), null, 2)}\n`;
}

/**
 * `value` as compact JSON with keys sorted and every key in `ignore` dropped at every level. Two files with
 * the same key differ only in what `ignore` names, so a fetch script can leave the old file in
 * place and a scheduled refresh has nothing to commit. Both fetch scripts ignore `fetchedAt` (when a row
 * was read) and `error` (a failure's free-form message, which can carry a duration or request id).
 */
export function contentKey(value: unknown, ignore: readonly string[]): string {
  return JSON.stringify(normalizeKeys(value, ignore));
}
