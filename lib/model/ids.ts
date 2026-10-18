/**
 * The normalized domain model (lib/model/): sections → leagues → divisions → teams, games, standings.
 * League facts (rules, chains, ladders, dates) are NOT here; they are config in lib/config/leagues.ts, whose
 * shapes are lib/model/league-config.ts. Everything is exported; nothing here is a class and nothing here
 * has behaviour. Model files import nothing but types from each other.
 *
 * This file: identity (ids, slugs, source ids).
 */

// ---------- identity ----------

/** MaxPreps `schoolId` / `teamId` GUID. THE primary key across all sources. */
export type TeamId = string;

/**
 * MaxPreps `contestId` GUID, or `sblive:<digits>` for a game that only si.com has and that D2 rule 2
 * published (lib/backfill.ts). URL params map ':' to '-' (lib/shared/game-id.ts).
 */
export type ContestId = string;

/**
 * The five CIF sections with a covered league: three in Northern California (CCS, NCS, NS) and two in
 * Southern California (the Southern Section's 'ss' and the San Diego Section's 'sds'). The snapshot
 * schema's `sectionId` enum is this list (lib/snapshot-schema.ts proves the two agree at compile time).
 */
export type SectionId = 'ccs' | 'ncs' | 'ns' | 'ss' | 'sds';

/**
 * The site's two halves, the NorCal/SoCal toggle (DESIGN-socal §2.1.1). A property of a SECTION
 * (SectionConfig.region in lib/model/league-config.ts), so a league's or a team's region is always
 * derived from its section and never stored in the snapshot. Not the clubs' CLUB_REGIONS
 * (lib/clubs-schema.ts) and not a venue's `address.region` (a state code): those are separate concepts
 * that happen to share the word.
 */
export type RegionId = 'norcal' | 'socal';

/**
 * 'scval' | 'bval' | 'pcal' | 'mcal' | 'eal' | 'sunset' | 'city' | 'north-county' | 'metro' as DATA.
 * Validated against LEAGUES at load and at parse.
 */
export type LeagueId = string;

/**
 * One league table. Globally unique: 'de-anza' | 'el-camino' | 'mt-hamilton' | 'santa-teresa' | 'pcal' |
 * 'marin-county' | 'eal' | 'sunset' | 'city-western' | 'city-eastern' | 'avocado' | 'palomar' | 'valley' |
 * 'metro-mesa' | 'metro-south-bay'. A single-division league may reuse its league id ('pcal', 'eal',
 * 'sunset'). Usually one MaxPreps table, but not always: the San Diego Section's Valley division has no
 * MaxPreps table at all (DivisionConfig.maxprepsLeagueId null).
 */
export type DivisionId = string;

/** Our URL slug, validated against the registry. The 15 SCVAL slugs are frozen. */
export type TeamSlug = string;

/** The CCS PLAYOFF division (never a league division). Always "CCS Division 1/2" in copy. */
export type CcsDivisionName = 'Division 1' | 'Division 2';

/** The league documents an official schedule is read from; the snapshot and bundle schemas take z.enum of this list. */
export const OFFICIAL_SOURCE_IDS = ['scval-pdf', 'bval-docx', 'pcal-pdf', 'mcal-pdf'] as const;

export type OfficialSourceId = (typeof OFFICIAL_SOURCE_IDS)[number];

export type SourceId =
  | 'maxpreps-api' | 'maxpreps-html' | 'sblive' | OfficialSourceId
  | 'ccs-pdf' | 'ccs-ical' | 'vnn-ics' | 'cifss' | 'derived';
