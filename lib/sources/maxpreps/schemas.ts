/**
 * Zod schemas of the MaxPreps "ghost API" responses (SPEC §1.1) and of the bootstrap page's
 * `__NEXT_DATA__` (SPEC §1.1h).
 *
 * Every schema is PERMISSIVE about unknown fields (z.looseObject) and STRICT about the fields we
 * read, so MaxPreps schema drift fails loudly at fetch time instead of writing garbage.
 */

import { z } from 'zod';

export const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.looseObject({
    status: z.union([z.number(), z.string()]).optional(),
    message: z.unknown().optional(),
    data,
  });

/** GET /leagues/{leagueId}/v1 — the season-key assertion (SPEC §1.1f). */
export const LeagueMetaSchema = z.looseObject({
  leagueId: z.string(),
  name: z.string(),
  sportSeasonId: z.string(),
  sportSeasonName: z.string().nullable().optional(),
  year: z.string(),
  season: z.string().nullable().optional(),
  teamLevel: z.string().nullable().optional(),
  sectionId: z.string().nullable().optional(),
  sectionName: z.string().nullable().optional(),
  stateCode: z.string().nullable().optional(),
  canonicalUrl: z.string().nullable().optional(),
});
export type LeagueMeta = z.infer<typeof LeagueMetaSchema>;

/** GET /leagues/{leagueId}/standings/v1?sportseasonid= (SPEC §1.1a). */
export const StandingsRowSchema = z.looseObject({
  schoolId: z.string(),
  schoolName: z.string(),
  schoolNameAcronym: z.string().nullable(),
  schoolFormattedName: z.string().nullable().optional(),
  teamCanonicalUrl: z.string().nullable(),
  schoolMascotUrl: z.string().nullable().optional(),
  schoolColor1: z.string().nullable(),
  schoolColor2: z.string().nullable(),
  conferenceWins: z.number(),
  conferenceLosses: z.number(),
  conferenceTies: z.number(),
  overallWins: z.number(),
  overallLosses: z.number(),
  overallTies: z.number(),
  // League-only GF / GA. (MaxPreps calls goals "points".)
  conferencePoints: z.number(),
  conferencePointsAgainst: z.number(),
  points: z.number(),
  pointsAgainst: z.number(),
  conferenceContestsPlayed: z.number(),
  overallContestsPlayed: z.number(),
  conferenceStandingPlacement: z.number().nullable(),
  conferenceWinningPercentage: z.number(),
  winningPercentage: z.number(),
  streak: z.number(),
  streakResult: z.string().nullable(),
  homeWins: z.number(),
  homeLosses: z.number(),
  homeTies: z.number(),
  awayWins: z.number(),
  awayLosses: z.number(),
  awayTies: z.number(),
  neutralWins: z.number(),
  neutralLosses: z.number(),
  neutralTies: z.number(),
  // null on a row that has never played: Red Bluff's 0-0-0 EAL row (2026-10-04). Read as '' so the
  // inferred type, ReportedRecord and the snapshot schema stay `string`.
  modifiedOn: z.string().nullable().transform((v) => v ?? ''),
  sportSeasonId: z.string().nullable().optional(),
});
export type StandingsRow = z.infer<typeof StandingsRowSchema>;

export const StandingsResponseSchema = envelope(z.array(StandingsRowSchema));

/**
 * One entry of contest.teams[] (SPEC §1.1b).
 *
 * `teamId` and `name` are nullable: an opponent MaxPreps has not named yet ("TBA") arrives as
 * `teamId: null, name: null, isTeamTBA: true` (Ann Sobrato 64c8188b, Stevenson 55207683, University
 * 64e0b2e5 on 2026-10-02), and one such row must never reject a whole feed. `splitTbaRows` removes
 * those rows before anything reads a side (SPEC §7.6 step 1).
 */
export const ContestTeamSchema = z.looseObject({
  teamId: z.string().nullable(),
  name: z.string().nullable(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  formattedName: z.string().nullable().optional(),
  mascot: z.string().nullable().optional(),
  schoolNameAcronym: z.string().nullable().optional(),
  teamCanonicalUrl: z.string().nullable().optional(),
  color1: z.string().nullable().optional(),
  color2: z.string().nullable().optional(),
  /** null before the game. NEVER coerce to 0 (SPEC §5.5.3). */
  score: z.number().nullable(),
  result: z.string().nullable(),
  /** 0 = home, 1 = away, 2 = neutral (SPEC §1.1g). */
  homeAwayType: z.number(),
  /** 0 = league / conference, 1 = non-conference (SPEC §1.1g). */
  contestType: z.number(),
  index: z.number().nullable().optional(),
  isForfeit: z.boolean(),
  isTeamTBA: z.boolean(),
  isDeleted: z.boolean(),
  dnp: z.boolean().nullable().optional(),
});
export type ContestTeam = z.infer<typeof ContestTeamSchema>;

export const ContestSchema = z.looseObject({
  contestId: z.string(),
  /** Naive local school time, America/Los_Angeles. */
  date: z.string(),
  dateCode: z.number().nullable().optional(),
  location: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  modifiedOn: z.string().nullable().optional(),
  isDeleted: z.boolean().nullable().optional(),
  hasResult: z.boolean().nullable().optional(),
  sportSeasonId: z.string().nullable().optional(),
  teams: z.array(ContestTeamSchema),
});

export const TeamCalculatedSchema = z.looseObject({
  /** null for an unnamed (TBA) side, like ContestTeamSchema.teamId. */
  teamId: z.string().nullable(),
  resultString: z.string().nullable().optional(),
  calculatedTeamContestResult: z.number().nullable().optional(),
  currentLiveScore: z.number().nullable().optional(),
});

export const CalculatedFieldsSchema = z.looseObject({
  contestId: z.string(),
  title: z.string().nullable().optional(),
  /** 1 Deleted · 2 Pregame · 3 InProgress · 4 Final · 5 ScoreNotReported (SPEC §1.1g). */
  contestState: z.number(),
  canonicalUrl: z.string().nullable(),
  description: z.string().nullable().optional(),
  /** Trust these, not dateCode (SPEC §1.1g / risk 10). */
  isDateTba: z.boolean(),
  isTimeTba: z.boolean(),
  isLiveGameInProgress: z.boolean().nullable().optional(),
  overtimePeriodsPlayed: z.number().nullable().optional(),
  overtimeShortAlias: z.string().nullable().optional(),
  currentLivePeriod: z.string().nullable().optional(),
  currentLiveTime: z.string().nullable().optional(),
  contestDateInGMT: z.string(),
  endsOn: z.string().nullable().optional(),
  contestLength: z.number().nullable().optional(),
  bracketName: z.string().nullable().optional(),
  bracketIsPublished: z.boolean().nullable().optional(),
  bracketGameIndex: z.number().nullable().optional(),
  tournamentName: z.string().nullable().optional(),
  tournamentCanonicalUrl: z.string().nullable().optional(),
  teamsCalculated: z.array(TeamCalculatedSchema),
});

/** GET /gatewayweb/react/schedule-calculated/v1?teamId=&sportSeasonId= (SPEC §1.1b). */
export const ScheduleRowSchema = z.looseObject({
  contest: ContestSchema,
  calculatedFields: CalculatedFieldsSchema,
  goFanUrl: z.string().nullable().optional(),
  nfhsStreamUrl: z.string().nullable().optional(),
});
export type ScheduleRow = z.infer<typeof ScheduleRowSchema>;

export const ScheduleResponseSchema = envelope(z.array(ScheduleRowSchema));

/**
 * GET /gatewayweb/react/team-context/v1?teamId=&sportSeasonId= (SPEC §1.1e).
 *
 * ⚠️ ~738 KB per team, almost all of it `schoolSportSeasonsData` (844 entries). Never in the daily
 * cron — this is the once-per-season league-resolution read that scripts/discover-season.ts uses.
 * `schoolSportSeasonsData` is declared but not validated here: only scripts/fetch-prior-season.ts
 * reads it (through SchoolSportSeasonsSchema), so a drift in it never fails discover-season.
 */
export const TeamContextSchema = envelope(
  z.looseObject({
    schoolSportSeasonsData: z.unknown().optional(),
    teamData: z.looseObject({
      leagueId: z.string().nullable().optional(),
      leagueName: z.string().nullable().optional(),
      leagueCanonicalUrl: z.string().nullable().optional(),
      sectionId: z.string().nullable().optional(),
      sectionName: z.string().nullable().optional(),
      sportSeasonId: z.string().nullable().optional(),
      allSeasonId: z.string().nullable().optional(),
      sportSeasonName: z.string().nullable().optional(),
      year: z.string().nullable().optional(),
      season: z.string().nullable().optional(),
      level: z.string().nullable().optional(),
      stateCode: z.string().nullable().optional(),
      schoolName: z.string().nullable().optional(),
      schoolNameAcronym: z.string().nullable().optional(),
      schoolMascot: z.string().nullable().optional(),
      schoolCity: z.string().nullable().optional(),
      schoolColor1: z.string().nullable().optional(),
      schoolColor2: z.string().nullable().optional(),
      canonicalUrl: z.string().nullable().optional(),
    }),
  }),
);
export type TeamContext = z.infer<typeof TeamContextSchema>['data'];

/** team-context's `schoolSportSeasonsData[]`: every season a team has played, with its `sportSeasonId`. */
export const SchoolSportSeasonsSchema = z.array(
  z.looseObject({
    sportSeasonId: z.string(),
    sport: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    level: z.string().nullable().optional(),
    year: z.string().nullable().optional(),
  }),
);

/**
 * The bootstrap read of https://www.maxpreps.com/ca/field-hockey/ (SPEC §1.1h).
 * `.query.ssid` is [U]; `navBarProps.genderSportData.allSeasonId` is [V] and lives under
 * navBarProps, NOT layoutProps.
 */
export const BootstrapNextDataSchema = z.looseObject({
  query: z
    .looseObject({
      ssid: z.string().optional(),
      sportSeasonId: z.string().optional(),
      allSeasonId: z.string().optional(),
      gendersport: z.string().optional(),
      teamLevel: z.string().optional(),
    })
    .optional(),
  props: z
    .looseObject({
      pageProps: z
        .looseObject({
          navBarProps: z
            .looseObject({
              genderSportData: z
                .looseObject({
                  allSeasonId: z.string().optional(),
                  genderSportId: z.string().optional(),
                  teamLevel: z.string().optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
