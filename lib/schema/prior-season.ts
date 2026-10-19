/**
 * The Zod contract for data/prior-season.json — last season's results (DESIGN §20.1): every final
 * between two registry teams in the season before this one, read once from MaxPreps by
 * scripts/fetch-prior-season.ts. Their only use is the Elo rating's starting point
 * (lib/engine/ratings.ts): each team starts a season from the rating these games give it. Nothing on the
 * site prints them.
 *
 * This module is pure (the schema and its season window), so the script that writes the file can
 * run whatever state the file is in; lib/prior-season.ts loads it, and the script's normalization of
 * the feeds is lib/pipeline/prior-season-feeds.ts.
 * `PriorSeasonSchema` holds the file to: every side a registry team under its own slug, no game
 * listed twice or against itself, and every date inside the season the file names.
 */

import { z } from 'zod';

import { TEAMS } from '@/lib/registry/teams';
import { dateKey } from './primitives';

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

/** A fall season's dates, generously: Jul 1 to Jan 31 ("2025-26" → 2025-07-01 … 2026-01-31). */
export function seasonWindow(season: string): { from: string; to: string } {
  const start = Number(season.slice(0, 4));
  return { from: `${start}-07-01`, to: `${start + 1}-01-31` };
}
