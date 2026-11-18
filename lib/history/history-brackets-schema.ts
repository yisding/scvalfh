/**
 * The Zod contract for data/field-hockey/history-brackets-2025-26.json — the 2025 postseason brackets the
 * archive shows beside last season's league standings (DESIGN §3.9): the CCS championship (fed by
 * SCVAL, BVAL and PCAL), the San Diego Section championships (City, North County and Metro) and the
 * Tournament of Champions (the Sunset's and the LA independents' postseason, which no CIF section runs:
 * `tournaments.toc`, DESIGN §24.13).
 *
 * The file is transcribed by hand, once, from each section's own documents (its `notes` say which
 * and how), like the bundled schedules in data/field-hockey/official/; the Tournament of Champions, which publishes
 * no bracket, from a school newspaper and MaxPreps' 2025-26 schedules. Nothing refreshes it: a 2025
 * bracket does not change. What this contract guards is that a transcription slip cannot reach
 * the page: every school is a registry team of the bracket's leagues, every winner matches its
 * score, every winner plays in the next round, and every bracket ends in one final.
 */

import { z } from 'zod';

import { TOC } from '../league-config/sections';
import { LEAGUE_IDS, getLeague } from '../leagues';
import { dateKey, slugId } from '../schema-primitives';
import { teamsInLeague } from '../teams';
import type { SectionId } from '../types';

/** The sections with a 2025 bracket. The NCS, Northern Section and Southern Section held none. */
export const BRACKET_SECTION_IDS = ['ccs', 'sds'] as const satisfies readonly SectionId[];
export type BracketSectionId = (typeof BRACKET_SECTION_IDS)[number];

/** The postseasons with a 2025 bracket that no CIF section runs: the Tournament of Champions. */
export const BRACKET_TOURNAMENT_IDS = ['toc'] as const;
export type BracketTournamentId = (typeof BRACKET_TOURNAMENT_IDS)[number];

/** A seeded bracket's seed: both play-in teams carry the seed they played for. */
const SEED = z.number().int().min(1).max(16);
/** An unseeded bracket's (the Tournament of Champions publishes none). */
const NO_SEED = z.null();

/**
 * The game, round and division contracts of one bracket. `slugs` are the schools that may appear (with
 * `whose` naming them in the error), `seed` the side's seed contract: SEED for a section's bracket, NO_SEED
 * for the Tournament of Champions, which publishes none, so its sides carry `seed: null` and the page never
 * prints one (copy rule 5, DESIGN §24.13).
 */
function bracketParts<Seed extends typeof SEED | typeof NO_SEED>(slugs: ReadonlySet<string>, whose: string, seed: Seed) {
  const teamSlug = slugId.refine((slug) => slugs.has(slug), `not a registry slug of ${whose}`);

  const side = z.object({
    /** The bracket's seed (SEED), or null in a bracket whose source publishes none (NO_SEED). */
    seed,
    /** The source's own spelling ("Mt. Carmel HS", "St. Ignatius College Preparatory"). */
    name: z.string().min(1),
    /** The join key: the page prints the registry name (lib/history/history.ts historySchoolName). */
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
      /**
       * How a game level after regulation was settled. 'tiebreak-unreported': it ended level, the winner
       * went through, and no source says how (the Tournament of Champions' Bonita v Newport Harbor, 1-1).
       */
      decidedBy: z.enum(['overtime', 'double-overtime', 'shootout', 'tiebreak-unreported']).nullable(),
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
        // A level score is decided by a shootout, and the winner wins it when its goals are known; or
        // the source gives a winner and not how the tie was broken.
        if (g.decidedBy === 'tiebreak-unreported') return g.shootout === null;
        if (g.decidedBy !== 'shootout') return false;
        if (g.shootout === null) return true;
        const [st, sb] = g.shootout;
        return st !== sb && (st > sb ? 'top' : 'bottom') === g.winner;
      }
      return (
        g.shootout === null &&
        g.decidedBy !== 'shootout' &&
        g.decidedBy !== 'tiebreak-unreported' &&
        (top > bottom ? 'top' : 'bottom') === g.winner
      );
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
      /**
       * A third-place game between the two beaten semifinalists, where the bracket held one (the
       * Tournament of Champions). It is no round: nobody advances from it.
       */
      thirdPlace: z.object({ date: dateKey, game }).optional(),
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
    )
    .refine((d) => {
      if (!d.thirdPlace) return true;
      const semis = d.rounds.at(-2);
      if (!semis || semis.games.length !== 2) return false;
      const beaten = new Set(semis.games.map((g) => g[g.winner === 'top' ? 'bottom' : 'top'].slug));
      const { game: g, date } = d.thirdPlace;
      return beaten.has(g.top.slug) && beaten.has(g.bottom.slug) && date >= semis.date;
    }, 'the third-place game is not between the two beaten semifinalists');

  return { division };
}

/** The common head of every bracket entry: its title, when its sources were read, and what they are. */
const bracketHead = {
  /** The championship's name, as its organizer titles it. */
  title: z.string().min(1),
  /** The day the sources were read. */
  retrievedOn: dateKey,
  /** What the page links as the source, in order. */
  sources: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).min(1),
  /** Provenance a maintainer needs; not printed. */
  notes: z.array(z.string().min(1)),
};

const uniqueDivisions = (divisions: ReadonlyArray<{ id: string }>) =>
  new Set(divisions.map((d) => d.id)).size === divisions.length;

function sectionSchema(sectionId: BracketSectionId) {
  const slugs: ReadonlySet<string> = new Set(
    LEAGUE_IDS.filter((l) => getLeague(l).sectionId === sectionId).flatMap((l) => teamsInLeague(l).map((t) => t.slug)),
  );
  const { division } = bracketParts(slugs, `a ${sectionId} league`, SEED);

  return z
    .object({
      section: z.literal(sectionId),
      ...bracketHead,
      divisions: z.array(division).min(1),
    })
    .refine((s) => uniqueDivisions(s.divisions), 'a division id repeats');
}

/**
 * The Tournament of Champions: one unseeded bracket of the 2025 entrants, every one a registry team of the
 * Southern Section's no-postseason leagues (the Sunset and the LA independents), as lib/teams.ts asserts of
 * the 2026 entrants in `TOC`. The organizer is printed; the event has no section.
 */
function tournamentSchema() {
  const slugs: ReadonlySet<string> = new Set(
    LEAGUE_IDS.filter((l) => getLeague(l).sectionId === 'ss').flatMap((l) => teamsInLeague(l).map((t) => t.slug)),
  );
  const { division } = bracketParts(slugs, 'a Sunset or LA independents team', NO_SEED);
  return z
    .object({
      tournament: z.literal(TOC.id),
      /** 'Los Angeles Field Hockey Association', as TOC names it. */
      organizer: z.literal(TOC.organizer),
      ...bracketHead,
      divisions: z.array(division).length(1),
    })
    .refine((s) => uniqueDivisions(s.divisions), 'a division id repeats');
}

export const HistoryBracketsSchema = z.object({
  season: z.string(),
  sport: z.string(),
  sections: z.object({ ccs: sectionSchema('ccs'), sds: sectionSchema('sds') }).strict(),
  tournaments: z.object({ toc: tournamentSchema() }).strict(),
});

// ---------------------------------------------------------------- the other builds' 2025-26 brackets, read whole

const guid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const publishedSide = z.object({
  teamId: guid.nullable(),
  name: z.string().min(1).nullable(),
  seed: z.number().int().min(1).nullable(),
  score: z.number().int().min(0).nullable(),
  from: guid.nullable(),
});

const publishedMatchup = z
  .object({
    id: guid,
    round: z.string().min(1),
    roundDate: dateKey,
    next: guid.nullable(),
    contestId: guid.nullable(),
    dateLocal: z.null(),
    bye: z.boolean(),
    winner: z.union([z.literal(0), z.literal(1)]).nullable(),
    site: z.string().min(1).nullable(),
    sides: z.tuple([publishedSide, publishedSide]),
  })
  // A finished championship: every game has both teams and a winner; a bye has one team and no winner.
  .refine(
    (m) => (m.bye ? m.winner === null && m.sides.filter((s) => s.teamId !== null).length === 1 : m.winner !== null && m.sides.every((s) => s.teamId !== null && s.name !== null)),
    'a game with no winner or an unnamed team, or a bye with a winner',
  );

/**
 * One division's bracket of a 2025-26 championship, as MaxPreps' tournament page published it (lib/types.ts
 * TournamentBracket, read by lib/sources/maxpreps-tournament.ts as /playoffs reads the current season's), so the
 * archive draws it with the same view (components/playoffs/tournament-brackets-view.ts). Every school of the
 * division is in it, ours or not: a side is keyed by MaxPreps' school id, and the registry names ours.
 */
const publishedBracket = z
  .object({
    event: z.enum(['ccs', 'cif']),
    tournament: z.string(),
    bracketId: guid,
    name: z.string().min(1),
    url: z.string().url(),
    matchups: z.array(publishedMatchup).min(1),
  })
  .refine((b) => {
    const ids = new Set(b.matchups.map((m) => m.id));
    const linked = b.matchups.every((m) => [m.next, m.sides[0].from, m.sides[1].from].every((l) => l === null || ids.has(l)));
    return ids.size === b.matchups.length && linked && b.matchups.filter((m) => m.next === null).length === 1;
  }, 'the matchups do not join into one tree')
  .refine(
    (b) =>
      b.matchups.every((m) => {
        if (m.next === null || m.bye) return true;
        // The winner goes on: the next game has the winner's school on the side this game feeds.
        const next = b.matchups.find((n) => n.id === m.next)!;
        const into = next.sides.find((s) => s.from === m.id);
        return into !== undefined && into.teamId === m.sides[m.winner as 0 | 1].teamId;
      }),
    'a winner does not go on to the next game',
  );

/**
 * `published` in the soccer, basketball and volleyball builds' data/<sport>/history-brackets-2025-26.json: the
 * 2025-26 CCS divisions (every one, ours or not) and the CIF State divisions a team of ours played in, read whole
 * from MaxPreps' tournament pages once the season was over. Nothing refreshes it.
 */
export const PublishedBracketsSchema = z.object({
  /** The day the pages were read. */
  retrievedOn: dateKey,
  /** Provenance a maintainer needs; not printed. */
  notes: z.array(z.string().min(1)),
  brackets: z.array(publishedBracket).min(1),
});

/** The other builds' file: no section or tournament the field hockey archive transcribes, and the brackets read whole. */
export const OtherHistoryBracketsSchema = z.object({
  season: z.string(),
  sport: z.string(),
  sections: z.object({}).strict(),
  tournaments: z.object({}).strict(),
  published: PublishedBracketsSchema.optional(),
});

export type PublishedBrackets = z.infer<typeof PublishedBracketsSchema>;

export type HistoryBrackets = z.infer<typeof HistoryBracketsSchema>;
export type SectionBracket = HistoryBrackets['sections'][BracketSectionId];
export type TournamentBracket = HistoryBrackets['tournaments'][BracketTournamentId];
/** A division of a section's bracket: every side seeded. */
export type SectionBracketDivision = SectionBracket['divisions'][number];
/** A division of a section's bracket or of the Tournament of Champions' (whose sides have no seed). */
export type HistoryBracketDivision = SectionBracketDivision | TournamentBracket['divisions'][number];
export type HistoryBracketRound = HistoryBracketDivision['rounds'][number];
export type HistoryBracketGame = HistoryBracketRound['games'][number];
export type HistoryBracketSide = HistoryBracketGame['top'];
