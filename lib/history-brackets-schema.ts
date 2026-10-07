/**
 * The Zod contract for data/history-brackets-2025-26.json — the 2025 section playoff brackets the
 * archive shows beside last season's league standings (DESIGN §3.9): the CCS championship (fed by
 * SCVAL, BVAL and PCAL) and the San Diego Section championships (City, North County and Metro).
 *
 * The file is transcribed by hand, once, from each section's own documents (its `notes` say which
 * and how), like the bundled schedules in data/official/. Nothing refreshes it: a section's
 * 2025 bracket does not change. What this contract guards is that a transcription slip cannot reach
 * the page: every school is a registry team of the section's leagues, every winner matches its
 * score, every winner plays in the next round, and every bracket ends in one final.
 */

import { z } from 'zod';

import { LEAGUE_IDS, getLeague } from './leagues';
import { dateKey, slugId } from './schema-primitives';
import { teamsInLeague } from './teams';
import type { SectionId } from './types';

/** The sections with a 2025 bracket. The NCS, Northern Section and Southern Section held none. */
export const BRACKET_SECTION_IDS = ['ccs', 'sds'] as const satisfies readonly SectionId[];
export type BracketSectionId = (typeof BRACKET_SECTION_IDS)[number];

function sectionSchema(sectionId: BracketSectionId) {
  const slugs: ReadonlySet<string> = new Set(
    LEAGUE_IDS.filter((l) => getLeague(l).sectionId === sectionId).flatMap((l) => teamsInLeague(l).map((t) => t.slug)),
  );
  const teamSlug = slugId.refine((slug) => slugs.has(slug), `not a registry slug of a ${sectionId} league`);

  const side = z.object({
    /** The bracket's seed; both play-in teams carry the seed they played for. */
    seed: z.number().int().min(1).max(16),
    /** The source's own spelling ("Mt. Carmel HS", "St. Ignatius College Preparatory"). */
    name: z.string().min(1),
    /** The join key: the page prints the registry name (lib/history.ts historySchoolName). */
    slug: teamSlug,
  });

  const game = z
    .object({
      /** The two sides in the order the bracket draws them, top first. */
      top: side,
      bottom: side,
      winner: z.enum(['top', 'bottom']),
      /** [top, bottom] goals, or null when no official source posts the score. */
      score: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable(),
      decidedBy: z.enum(['overtime', 'double-overtime', 'shootout']).nullable(),
      /** [top, bottom] shootout goals, when the game went to one and the source gives them. */
      shootout: z.tuple([z.number().int().min(0), z.number().int().min(0)]).nullable(),
      /** Set only when the game was not played on its round's date. */
      date: dateKey.optional(),
      /** The neutral site, where a source names one (the finals). */
      site: z.string().min(1).optional(),
      /** Where the score comes from when it is not the bracket: the San Diego Section's Record Book. */
      scoreSource: z.literal('record-book').optional(),
    })
    .refine((g) => g.top.slug !== g.bottom.slug, 'a team plays itself')
    .refine((g) => {
      if (g.score === null) return g.decidedBy === null && g.shootout === null;
      const [top, bottom] = g.score;
      if (top === bottom) {
        // A level score is decided by a shootout, and the winner wins it when its goals are known.
        if (g.decidedBy !== 'shootout') return false;
        if (g.shootout === null) return true;
        const [st, sb] = g.shootout;
        return st !== sb && (st > sb ? 'top' : 'bottom') === g.winner;
      }
      return g.shootout === null && g.decidedBy !== 'shootout' && (top > bottom ? 'top' : 'bottom') === g.winner;
    }, 'the winner, score, decidedBy and shootout disagree');

  const round = z.object({
    name: z.string().min(1),
    /** A play-in for one seed (San Diego Division II's 11th): the teams that skip it had no bye. */
    playIn: z.literal(true).optional(),
    date: dateKey,
    games: z.array(game).min(1),
  });

  const division = z
    .object({
      id: slugId,
      label: z.string().min(1),
      rounds: z.array(round).min(1),
    })
    .refine((d) => d.rounds.at(-1)!.games.length === 1, 'the last round is not a single final')
    .refine((d) => d.rounds.every((r, i) => i === 0 || r.date > d.rounds[i - 1].date), 'rounds are not in date order')
    .refine(
      (d) =>
        d.rounds.every((r) => {
          const teams = r.games.flatMap((g) => [g.top.slug, g.bottom.slug]);
          return new Set(teams).size === teams.length;
        }),
      'a team plays twice in one round',
    )
    .refine(
      (d) =>
        d.rounds.every((r, i) => {
          if (i === 0) return true;
          const prev = d.rounds[i - 1].games;
          const winners = new Set(prev.map((g) => g[g.winner].slug));
          const played = new Set(prev.flatMap((g) => [g.top.slug, g.bottom.slug]));
          const here = r.games.flatMap((g) => [g.top.slug, g.bottom.slug]);
          // Every winner moves on, and nobody who lost the round before plays again; a team that
          // did not play the round before had a bye (or entered after a play-in it did not need).
          return [...winners].every((s) => here.includes(s)) && here.every((s) => winners.has(s) || !played.has(s));
        }),
      'a winner does not advance, or a beaten team plays on',
    );

  return z
    .object({
      section: z.literal(sectionId),
      /** The championship's name, as the section titles it. */
      title: z.string().min(1),
      /** The day the sources were read. */
      retrievedOn: dateKey,
      /** What the page links as the source, in order. */
      sources: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).min(1),
      /** Provenance a maintainer needs; not printed. */
      notes: z.array(z.string().min(1)),
      divisions: z.array(division).min(1),
    })
    .refine((s) => new Set(s.divisions.map((d) => d.id)).size === s.divisions.length, 'a division id repeats');
}

export const HistoryBracketsSchema = z.object({
  season: z.string(),
  sport: z.string(),
  sections: z.object({ ccs: sectionSchema('ccs'), sds: sectionSchema('sds') }).strict(),
});

export type HistoryBrackets = z.infer<typeof HistoryBracketsSchema>;
export type SectionBracket = HistoryBrackets['sections'][BracketSectionId];
export type HistoryBracketDivision = SectionBracket['divisions'][number];
export type HistoryBracketRound = HistoryBracketDivision['rounds'][number];
export type HistoryBracketGame = HistoryBracketRound['games'][number];
export type HistoryBracketSide = HistoryBracketGame['top'];
