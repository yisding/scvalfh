/**
 * No count template ignores n === 1 (SPEC §0.4): a source guard against the '1 league games' /
 * '1 games' templates that lib/format/words.ts's helpers replaced (StandingsTable, MyTeamCard, the team
 * page, TeamStatTiles). The unit cases of the plural helpers are tests/lib/format/words.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { PAGE_CODE_ROOTS, readSource, sourceFiles } from '@/tests/support/source-tree';

describe('no count template ignores n === 1', () => {
  it('app/, components/ and views/ never interpolate a count straight before "games"', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles({ roots: PAGE_CODE_ROOTS, ext: ['.ts', '.tsx'] })) {
      for (const line of readSource(file).split('\n')) {
        // A line that already branches on the singular (`n === 1 ? … : `${n} games``) is fine.
        if (/=== 1\b/.test(line)) continue;
        for (const m of line.matchAll(/\$\{[^}]*(?:\.length|\.gp)\} (?:league )?games\b/g)) {
          offenders.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
