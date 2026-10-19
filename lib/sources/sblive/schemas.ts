/** Zod schemas of the three si.com page payloads the parsers read (SPEC §1.2). */

import { z } from 'zod';

/** Permissive about unknown fields, strict about ours — same rule as the MaxPreps client. */
const teamRef = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string(),
  webPath: z.string().nullable().optional(),
  /** Logo URL: `/uploads/production/school/{schoolId}/…` or `/uploads/production/team/{teamId}-v3/…`. */
  image: z.string().nullable().optional(),
});

const teamGameNode = z.looseObject({
  id: z.union([z.string(), z.number()]),
  /** ISO WITH offset, e.g. "2026-09-23T16:00:00.000-07:00" — better than MaxPreps' naive local. */
  date: z.string(),
  statusId: z.number().nullable().optional(),
  shortStatusText: z.string().nullable().optional(),
  longStatusText: z.string().nullable().optional(),
  gameTypeLabel: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  webPath: z.string().nullable().optional(),
  titleText: z.string().nullable().optional(),
  featured: z.looseObject({
    isHome: z.boolean().nullable().optional(),
    locationDescriptor: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    scoreText: z.string().nullable().optional(),
    team: teamRef.optional(),
  }),
  opponent: z.looseObject({
    isHome: z.boolean().nullable().optional(),
    scoreText: z.string().nullable().optional(),
    team: teamRef,
  }),
});

export const TeamGamesPropsSchema = z.looseObject({
  query: z.looseObject({
    team: z.looseObject({
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().optional(),
      webPath: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      games: z.looseObject({ nodes: z.array(teamGameNode) }),
    }),
  }),
});

const scoreboardGameTeam = z.looseObject({
  scoreText: z.string().nullable().optional(),
  isWinner: z.boolean().nullable().optional(),
  isLoser: z.boolean().nullable().optional(),
  isTbd: z.boolean().nullable().optional(),
  team: teamRef,
});

export const ScoreboardPropsSchema = z.looseObject({
  query: z.looseObject({
    scoreboardDate: z.looseObject({
      date: z.string(),
      games: z.looseObject({
        totalCount: z.number().nullable().optional(),
        /** si.com serves the first 24 games of a day in the page; the rest load in the browser (see parseScoresPage). */
        pageInfo: z
          .looseObject({ hasNextPage: z.boolean().nullable().optional(), endCursor: z.string().nullable().optional() })
          .nullable()
          .optional(),
        nodes: z.array(
          z.looseObject({
            id: z.union([z.string(), z.number()]),
            date: z.string(),
            statusId: z.number().nullable().optional(),
            longStatusText: z.string().nullable().optional(),
            titleText: z.string().nullable().optional(),
            webPath: z.string().nullable().optional(),
            gameTeams: z.array(scoreboardGameTeam),
          }),
        ),
      }),
    }),
  }),
});

export const StandingsPropsSchema = z.looseObject({
  query: z.looseObject({
    organization: z.looseObject({
      teamStandings: z.array(z.looseObject({ team: teamRef })),
    }),
  }),
});
