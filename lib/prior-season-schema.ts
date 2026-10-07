/**
 * The Zod contract for data/prior-season.json — last season's results (DESIGN §20.1): every final
 * between two registry teams in the season before this one, read once from MaxPreps by
 * scripts/fetch-prior-season.ts. Their only use is the Elo rating's starting point
 * (lib/ratings.ts): each team starts a season from the rating these games give it. Nothing on the
 * site prints them.
 *
 * This module is pure (the schema, the normalization, the season helpers), so the script that
 * writes the file can run whatever state the file is in; lib/prior-season.ts loads it.
 * `PriorSeasonSchema` holds the file to: every side a registry team under its own slug, no game
 * listed twice or against itself, and every date inside the season the file names.
 *
 * `priorGamesFromFeeds` is the script's normalization, kept here so tests can run it on synthetic
 * rows: one game per contest id from all 102 teams' feeds, finals only, both sides registry teams,
 * no forfeit (a forfeit has no goals, as in the standings), and the site from MaxPreps'
 * homeAwayType (2 on either side is neutral). A contest whose two feeds disagree on the score or
 * the host is reported, never guessed. A contest named in `PRIOR_EXCLUDED_CONTEST_IDS` (a MaxPreps
 * duplicate of another game the feeds already carry) is left out and counted, with its reason there.
 */

import { z } from 'zod';

import { dateKey } from './schema-primitives';
import type { ScheduleRow } from './sources/maxpreps';
import { TEAMS } from './teams';
import type { Team, TeamSlug } from './types';

export const PriorSeasonSchema = z
  .object({
    /** "2025-26" */
    season: z.string().regex(/^\d{4}-\d{2}$/),
    /** MaxPreps' own label: "25-26". */
    maxprepsYear: z.string().regex(/^\d{2}-\d{2}$/),
    sportSeasonId: z.string().min(1),
    source: z.literal('maxpreps-api'),
    fetchedAt: z.string().min(1),
    /** What the normalization left out, by reason (the file keeps the counts). */
    excluded: z.object({
      /** Rows MaxPreps marks deleted (contestState 1 or isDeleted). */
      deleted: z.number().int().min(0),
      /** Rows that were never final (scheduled, score not reported). */
      notFinal: z.number().int().min(0),
      /** Finals against a school that is not one of the registry's teams. */
      outsideRegistry: z.number().int().min(0),
      forfeit: z.number().int().min(0),
      /** Finals with a missing score. */
      unscored: z.number().int().min(0),
      /** Finals named in PRIOR_EXCLUDED_CONTEST_IDS: duplicates of a game the file already holds. */
      excludedByConfig: z.number().int().min(0),
    }),
    games: z.array(
      z.object({
        contestId: z.string().min(1),
        /** YYYY-MM-DD, local. */
        date: dateKey,
        /** Registry ids and slugs (TeamId, TeamSlug). */
        homeId: z.string().min(1),
        homeSlug: z.string().min(1),
        awayId: z.string().min(1),
        awaySlug: z.string().min(1),
        homeScore: z.number().int().min(0),
        awayScore: z.number().int().min(0),
        /** 'neutral' when MaxPreps marks either side neutral (homeAwayType 2). */
        site: z.enum(['home', 'neutral']),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    const byId = new Map(TEAMS.map((t) => [t.id, t]));
    const { from, to } = seasonWindow(file.season);
    const seen = new Set<string>();
    file.games.forEach((g, i) => {
      const at = ['games', i];
      if (seen.has(g.contestId)) ctx.addIssue({ code: 'custom', path: at, message: `contest ${g.contestId} is listed twice` });
      seen.add(g.contestId);
      if (g.homeId === g.awayId) ctx.addIssue({ code: 'custom', path: at, message: 'a team plays itself' });
      for (const [id, slug] of [[g.homeId, g.homeSlug], [g.awayId, g.awaySlug]] as const) {
        if (byId.get(id)?.slug !== slug) {
          ctx.addIssue({ code: 'custom', path: at, message: `${slug} (${id}) is not that registry team` });
        }
      }
      if (g.date < from || g.date > to) {
        ctx.addIssue({ code: 'custom', path: at, message: `${g.date} is outside the ${file.season} season` });
      }
    });
    if (file.maxprepsYear !== file.season.slice(2)) {
      ctx.addIssue({ code: 'custom', path: ['maxprepsYear'], message: `${file.maxprepsYear} does not name ${file.season}` });
    }
  });

export type PriorSeason = z.infer<typeof PriorSeasonSchema>;
/** One final between two registry teams last season. */
export type PriorGame = PriorSeason['games'][number];
/** What the normalization left out, by reason. */
export type PriorExcluded = PriorSeason['excluded'];

/** "25-26" (MaxPreps) → "2025-26". */
export function seasonLabel(maxprepsYear: string): string {
  return `20${maxprepsYear}`;
}

/** The season before a MaxPreps year: "26-27" → "25-26". */
export function previousMaxprepsYear(maxprepsYear: string): string {
  const [a, b] = maxprepsYear.split('-').map(Number);
  const two = (n: number) => String((n + 100) % 100).padStart(2, '0');
  return `${two(a - 1)}-${two(b - 1)}`;
}

/** A fall season's dates, generously: Jul 1 to Jan 31 ("2025-26" → 2025-07-01 … 2026-01-31). */
export function seasonWindow(season: string): { from: string; to: string } {
  const start = Number(season.slice(0, 4));
  return { from: `${start}-07-01`, to: `${start + 1}-01-31` };
}

/**
 * Last-season contests left out by hand, each with why. Only a row shown to repeat a game the feeds
 * already carry belongs here; a doubtful score is never fixed by dropping a row.
 */
export const PRIOR_EXCLUDED_CONTEST_IDS: Readonly<Record<string, string>> = {
  // Helix hosted a one-day tournament on Sat 2025-10-18. Patrick Henry's own schedule
  // (phpatriots.net, 2025-26) lists two games at Helix that day, 11:20 AM (L 0-3) and 4:10 PM (L 0-1),
  // and a home game against Mission Bay on Oct 17. MaxPreps carries those two as 1bd0e53f (3-0, entered
  // with the 4:10 time) and bb3d5c20 (1-0), each with Patrick Henry's keeper's saves (9 and 3), plus
  // this third row, a no-time Oct 17 placeholder the Section office scored 3-0 (Helix's own site lists
  // the event as "OCT 17 TBA"). Fountain Valley's and El Capitan's Helix games appear only as such
  // Oct 17 rows, so those are kept.
  '553a83bc-936f-4613-83ad-ddf008222f1f':
    'Helix 3-0 Patrick Henry, Oct 17 with no time: a duplicate of the Oct 18 11:20 AM game (1bd0e53f)',
};

export interface PriorNormalized {
  games: PriorGame[];
  excluded: PriorExcluded;
  /** "contest <id>: …" for a contest whose feeds disagree; it is left out. */
  conflicts: string[];
}

/** One game per contest from every team's feed of last season (see the header). */
export function priorGamesFromFeeds(
  feeds: ReadonlyMap<TeamSlug, readonly ScheduleRow[]>,
  teams: readonly Team[] = TEAMS,
  excludedIds: Readonly<Record<string, string>> = PRIOR_EXCLUDED_CONTEST_IDS,
): PriorNormalized {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const excluded: PriorExcluded = {
    deleted: 0,
    notFinal: 0,
    outsideRegistry: 0,
    forfeit: 0,
    unscored: 0,
    excludedByConfig: 0,
  };
  const games = new Map<string, PriorGame>();
  const conflicted = new Set<string>();
  const counted = new Set<string>();
  const count = (contestId: string, reason: keyof PriorExcluded) => {
    // A contest is in two feeds when both sides are registry teams: count it once.
    if (counted.has(contestId)) return;
    counted.add(contestId);
    excluded[reason] += 1;
  };

  for (const rows of feeds.values()) {
    for (const row of rows) {
      const c = row.contest;
      const sides = c.teams;
      if (row.calculatedFields.contestState === 1 || c.isDeleted || sides.some((t) => t.isDeleted)) {
        count(c.contestId, 'deleted');
        continue;
      }
      if (row.calculatedFields.contestState !== 4 || sides.length !== 2) {
        count(c.contestId, 'notFinal');
        continue;
      }
      const [a, b] = sides;
      const ta = a.teamId ? byId.get(a.teamId) : undefined;
      const tb = b.teamId ? byId.get(b.teamId) : undefined;
      if (!ta || !tb) {
        count(c.contestId, 'outsideRegistry');
        continue;
      }
      if (a.isForfeit || b.isForfeit) {
        count(c.contestId, 'forfeit');
        continue;
      }
      if (a.score === null || b.score === null) {
        count(c.contestId, 'unscored');
        continue;
      }
      if (Object.hasOwn(excludedIds, c.contestId)) {
        count(c.contestId, 'excludedByConfig');
        continue;
      }
      const neutral = a.homeAwayType === 2 || b.homeAwayType === 2;
      // The host is the side MaxPreps marks 0; at a neutral site the first side stands as "home".
      const flip = b.homeAwayType === 0 && a.homeAwayType !== 0;
      const [home, away] = flip ? [b, a] : [a, b];
      const [th, tw] = flip ? [tb, ta] : [ta, tb];
      const game: PriorGame = {
        contestId: c.contestId,
        date: c.date.slice(0, 10),
        homeId: th.id,
        homeSlug: th.slug,
        awayId: tw.id,
        awaySlug: tw.slug,
        homeScore: home.score!,
        awayScore: away.score!,
        site: neutral ? 'neutral' : 'home',
      };
      const prev = games.get(c.contestId);
      if (prev) {
        const same =
          prev.homeId === game.homeId
            ? prev.site === game.site && prev.homeScore === game.homeScore && prev.awayScore === game.awayScore
            : prev.site === 'neutral' && game.site === 'neutral' && prev.homeScore === game.awayScore && prev.awayScore === game.homeScore;
        if (!same) conflicted.add(c.contestId);
        continue;
      }
      games.set(c.contestId, game);
    }
  }

  const conflicts = [...conflicted].sort().map((id) => {
    const g = games.get(id)!;
    games.delete(id);
    return `contest ${id} (${g.date}, ${g.homeSlug} v ${g.awaySlug}): the two feeds disagree on the score or the host, so it is left out`;
  });
  return {
    games: [...games.values()].sort((x, y) => x.date.localeCompare(y.date) || x.contestId.localeCompare(y.contestId)),
    excluded,
    conflicts,
  };
}
