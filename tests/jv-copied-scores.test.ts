/**
 * JV scores that are the varsity game's score (lib/jv/jv-copied-scores.ts): a MaxPreps JV final scored exactly like
 * the same day's varsity final of the pair is withheld, another source fills it where it has the game, and the note
 * says what MaxPreps had and what is shown.
 */
import { describe, expect, it } from 'vitest';

import { jvCopiedScoreNote, withholdCopiedScores } from '../lib/jv/jv-copied-scores';
import { getJvCopiedScores, getJvGames } from '../lib/jv/jv';
import { getSnapshot } from '../lib/data';
import { game } from './game-builder';

// A MaxPreps JV row: the builder's games are 'derived'-scored, which the rule leaves alone.
const jvOf = (g: ReturnType<typeof game>) => ({ ...g, countsFor: null, postseason: null, provenance: { ...g.provenance, scores: 'maxpreps-api' as const } });

describe('withholdCopiedScores', () => {
  const varsity = game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-15', hs: 7, as: 2 });

  it('withholds a MaxPreps JV final scored exactly like the varsity final of the pair that day', () => {
    const jv = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-15', hs: 7, as: 2 }));
    const { games, withheld } = withholdCopiedScores([jv], [varsity]);
    expect(games[0].status).toBe('score-pending');
    expect(games[0].home.score).toBeNull();
    expect(withheld.get(jv.contestId)).toEqual({ varsityContestId: varsity.contestId, maxpreps: { home: 7, away: 2 } });
  });

  it('reads the pair either way round, and leaves another score, another day and a non-MaxPreps score alone', () => {
    const swapped = jvOf(game({ home: 'santa-clara', away: 'los-gatos', date: '2026-09-15', hs: 2, as: 7 }));
    const other = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-15', hs: 12, as: 0 }));
    const later = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-16', hs: 7, as: 2 }));
    const row = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-15', hs: 7, as: 2 }));
    const site = { ...row, provenance: { ...row.provenance, scores: 'school-site' as const } };
    const { withheld } = withholdCopiedScores([swapped, other, later, site], [varsity]);
    expect([...withheld.keys()]).toEqual([swapped.contestId]);
  });

  it('says what MaxPreps had and what is shown', () => {
    const jv = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-09-15', hs: 7, as: 2 }));
    const { games, withheld } = withholdCopiedScores([jv], [varsity]);
    const entry = withheld.get(jv.contestId)!;
    expect(jvCopiedScoreNote(games[0], entry)).toMatch(/no other source has this JV game, so it is not shown\.$/);
    const filled = { ...jv, home: { ...jv.home, score: 12 }, away: { ...jv.away, score: 0 }, provenance: { ...jv.provenance, scores: 'sblive' as const } };
    expect(jvCopiedScoreNote(filled, entry)).toMatch(/si\.com’s JV page has Santa Clara 0, Los Gatos 12, which is shown\.$/);
    expect(jvCopiedScoreNote({ ...jv, provenance: { ...jv.provenance, scores: 'sblive' } }, entry)).toMatch(/the same score, which is shown\.$/);
  });
});

describe('over the bundled files', () => {
  it('no listed JV final keeps a MaxPreps score that is its varsity game’s', () => {
    const v = getSnapshot().games.filter((g) => g.status === 'final');
    const key = (g: { dateKey: string; home: { teamId: string | null; score: number | null }; away: { teamId: string | null; score: number | null } }) =>
      `${g.dateKey}|${[`${g.home.teamId}:${g.home.score}`, `${g.away.teamId}:${g.away.score}`].sort().join('|')}`;
    const varsity = new Set(v.map(key));
    const copies = getJvGames().filter((g) => g.status === 'final' && g.provenance.scores === 'maxpreps-api' && varsity.has(key(g)));
    expect(copies.map((g) => g.contestId)).toEqual([]);
    for (const [id] of getJvCopiedScores()) {
      const g = getJvGames().find((x) => x.contestId === id)!;
      expect(g.status === 'final' ? g.provenance.scores : 'withheld').not.toBe('maxpreps-api');
    }
  });
});
