/**
 * The Zod contract for data/commits.json — which players on the 43 tracked varsity rosters a public
 * page says have committed to play a sport in college (field hockey or any other), and the colleges
 * they committed to (SPEC §1.1j3, DESIGN §21).
 *
 * The file is research, not a script's output, like data/clubs.json: it was written by hand on its
 * `capturedAt` date, every commitment checked twice (a checker re-opened each source, then an
 * independent refuter tried to break it), and nothing rebuilds it. This contract only says what
 * shape its facts must have.
 *
 * Separate from lib/commits.ts (the read API, which imports the file) so tests and scripts can
 * parse a file without loading one — the split lib/clubs-schema.ts / lib/clubs.ts uses.
 *
 * Invariants:
 *   1. college slugs are unique, and a college has at most one program per sport
 *   2. every commitment's `college` names a college in colleges[], and that college has a program
 *      in the commitment's `sport` (its division and conference are the sport's, not the college's)
 *   3. (teamSlug, athleteId) is unique: a player has at most one commitment
 *   4. every college, and every program of it, has at least one commitment: the file holds no
 *      college or program nobody committed to, and no `asOf` is after `capturedAt` (it is the
 *      earliest date a source gave by then)
 *   5. every URL is https and none is on a social-media host (lib/clubs-schema.ts BANNED_HOSTS, a
 *      backstop rather than a complete list): a program page and every source. Commitments are often
 *      announced only on social media; such a post is never a source, so a commitment with no other
 *      public page is not in the file
 *   6. every college and every commitment has at least one source
 *   7. a quote is 1-300 characters (kept for maintainers, never rendered)
 *   8. `asOf` is a day, a month or a year (isCommitDate): a commitment happens on a date, never
 *      over a season or a range
 *   9. the join to data/rosters.json — the row exists, carries the same fullName, is not JV, and
 *      agrees with every stated class year — lives in lib/commits.ts: this file cannot see the
 *      rosters
 * 1-4 are one file-level `superRefine(checkCommitsFile)`, each failure a named issue with a path
 * (the lib/snapshot-schema.ts idiom).
 */

import { z } from 'zod';

import { isBannedHost, isCalendarDate, isHttpsUrl } from './clubs-schema';
import { TEAMS } from './teams';

/**
 * committed  a public page says the player has committed to play field hockey there (a verbal or
 *            announced commitment)
 * signed     a page says the player has signed (a signing day, an athletics aid agreement, a
 *            college's signing class)
 */
export const COMMIT_STATUSES = ['committed', 'signed'] as const;
export type CommitStatus = (typeof COMMIT_STATUSES)[number];

/**
 * high    one first-hand page names the player, the college and the school, or it is the player's
 *         own recruiting profile showing the commitment
 * medium  the match rests on a class year plus a Northern California location, on a nickname
 *         standing for the school, or on a single self-reported line on a list
 */
export const COMMIT_CONFIDENCES = ['high', 'medium'] as const;
export type CommitConfidence = (typeof COMMIT_CONFIDENCES)[number];

/**
 * The sport a commitment is for. Field hockey is the site's own; the rest are the other sports the
 * players here can commit to (a two-sport athlete's college commitment is often in lacrosse or
 * soccer). The list is every sport the NCAA, NAIA and NJCAA hold a championship or an emerging-sport
 * program in, plus squash and sailing, which colleges sponsor as varsity sports under their own
 * associations — so a commitment to any college team has a sport here. It is closed on purpose: each
 * sport has its words in components/commits/commit-view.ts SPORT_WORDS, which the type checker holds
 * to this list, so a sport colleges add later is added here and there together. Kebab-case, like every
 * other id in the file.
 */
export const COMMIT_SPORTS = [
  'field-hockey',
  'lacrosse',
  'soccer',
  'basketball',
  'volleyball',
  'beach-volleyball',
  'softball',
  'track-and-field',
  'cross-country',
  'swimming-and-diving',
  'water-polo',
  'rowing',
  'golf',
  'tennis',
  'ice-hockey',
  'gymnastics',
  'equestrian',
  'acrobatics-and-tumbling',
  'stunt',
  'competitive-cheer',
  'competitive-dance',
  'flag-football',
  'rugby',
  'wrestling',
  'fencing',
  'bowling',
  'triathlon',
  'rifle',
  'skiing',
  'squash',
  'sailing',
  'baseball',
  'football',
] as const;
export type CommitSport = (typeof COMMIT_SPORTS)[number];

/** The level a college's team in one sport plays at. Also the order /commits counts them in. */
export const COLLEGE_DIVISIONS = ['ncaa-d1', 'ncaa-d2', 'ncaa-d3', 'naia'] as const;
export type CollegeDivision = (typeof COLLEGE_DIVISIONS)[number];

export const COMMIT_SOURCE_KINDS = [
  /** a SportsRecruits athlete or organization page */
  'sportsrecruits',
  'ncsa',
  'hudl',
  'fieldlevel',
  /** a MaxPreps page: a career page, an article */
  'maxpreps',
  /** a youth club's own site (a player page, a college-placement list, a blog post) */
  'club-site',
  /** a news story or a field hockey site's post (Stick Together, a school paper, a local paper) */
  'news',
  'school-site',
  /** the college's own site */
  'college',
  /** a commitment list, watchlist, all-star or showcase list */
  'event',
  'other',
] as const;
export type CommitSourceKind = (typeof COMMIT_SOURCE_KINDS)[number];

/**
 * The three shapes a commitment's `asOf` may take — the earliest date a source gives for it (the
 * announcement, or the date of the earliest dated page that states it):
 *   YYYY-MM-DD   a real day        2026-06-15
 *   YYYY-MM      a month, 01-12    2026-06
 *   YYYY                           2026
 * A season ("2025-26") or a range ("2025-2026") is not a date a commitment happened on.
 */
export function isCommitDate(v: string): boolean {
  if (isCalendarDate(v)) return true;
  if (/^\d{4}$/.test(v)) return true;
  const month = /^\d{4}-(\d{2})$/.exec(v);
  return month !== null && Number(month[1]) >= 1 && Number(month[1]) <= 12;
}

// ---------------------------------------------------------------- building blocks

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'expected a lower-case id');

const TEAM_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));
const teamSlug = id.refine((slug) => TEAM_SLUGS.has(slug), 'not a registry team slug');

const dateOnly = z.string().refine(isCalendarDate, 'expected YYYY-MM-DD');

/** Two refusals, two messages: not an https URL at all, or a social-media host. */
const httpsUrl = z
  .string()
  .refine(isHttpsUrl, 'expected an https URL')
  .refine((v) => !isBannedHost(v), 'social media is not a source');

const text = z.string().min(1);

// ---------------------------------------------------------------- colleges

/** A page the college record was read from, and what it gave. */
export const CollegeSourceSchema = z.object({
  url: httpsUrl,
  what: text,
});

/**
 * One of a college's teams that a player here committed to. The level and the conference are the
 * team's own: they differ by sport at one college (Johns Hopkins plays field hockey and lacrosse in
 * Division I and most other sports in Division III; UC Davis plays field hockey in the MPSF and
 * soccer in the Big West).
 */
export const CollegeProgramSchema = z.object({
  sport: z.enum(COMMIT_SPORTS),
  /** The level this team plays at. */
  division: z.enum(COLLEGE_DIVISIONS),
  /** This team's conference, as the college's athletics site names it, when it has one. */
  conference: text.nullable(),
  /** This sport's page on the college's own athletics site. */
  url: httpsUrl.nullable(),
});

export const CollegeSchema = z.object({
  /** Ours, kebab-case: the `#college-<slug>` anchor on /commits. */
  slug: id,
  /** The official name: "Stanford University". */
  name: text,
  /** The display name when set ("Stanford", "UC Davis"); `name` otherwise. */
  shortName: text.nullable(),
  city: text,
  /** A two-letter US state code ("CA"), or a country. */
  state: text,
  /** The teams players here committed to, one per sport, field hockey first when it has one. */
  programs: z.array(CollegeProgramSchema).min(1, 'a college needs at least one program'),
  /** The pages the college's place and every program's level, conference and page were read from. */
  sources: z.array(CollegeSourceSchema).min(1, 'a college needs at least one source'),
  checkedOn: dateOnly,
});

// ---------------------------------------------------------------- commitments

export const CommitSourceSchema = z.object({
  url: httpsUrl,
  kind: z.enum(COMMIT_SOURCE_KINDS),
  /** Verbatim from the page. Kept in the file so a maintainer can re-check it; never rendered. */
  quote: text.max(300),
  /** The school as the page names it, when it does. */
  statedSchool: text.nullable(),
  /** The graduation year the page states; lib/commits.ts checks it against the roster grade. */
  statedClassYear: z.number().int().min(2020).max(2040).nullable(),
  /** The page's own date, as it gives it: free text ("Jun 15, 2026", "Summer 2026"). */
  sourceDate: text.nullable(),
});

export const CommitmentSchema = z.object({
  teamSlug,
  /** The MaxPreps per-season athlete GUID: the join key to data/rosters.json. */
  athleteId: text,
  /** As MaxPreps spells it; lib/commits.ts refuses any other spelling. */
  fullName: text,
  college: id,
  /** The sport the player committed to play at `college`; that college has a program in it. */
  sport: z.enum(COMMIT_SPORTS),
  status: z.enum(COMMIT_STATUSES),
  /** The earliest date a source gives for the commitment (isCommitDate), when one does. */
  asOf: z.string().refine(isCommitDate, 'expected YYYY-MM-DD, YYYY-MM or YYYY').nullable(),
  confidence: z.enum(COMMIT_CONFIDENCES),
  sources: z.array(CommitSourceSchema).min(1, 'a commitment needs at least one source'),
  /** What the match rests on, for maintainers. Never rendered: it can name people who are not players. */
  basis: text,
});

const CommitsFileObject = z.object({
  /** How the file was made. */
  builtBy: text,
  capturedAt: dateOnly,
  /** The roster season the commitments join to ("26-27"); lib/commits.ts checks it is rosters.json's. */
  season: z.string().regex(/^\d{2}-\d{2}$/, 'expected a season like 26-27'),
  /** Method, rules and recall, in words. */
  notes: z.array(text),
  colleges: z.array(CollegeSchema),
  commitments: z.array(CommitmentSchema),
});

type Ctx = z.RefinementCtx;

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Invariants 1-4: what no single record can see. */
function checkCommitsFile(f: z.infer<typeof CommitsFileObject>, ctx: Ctx): void {
  const slugs = new Set<string>();
  const programs = new Set<string>();
  f.colleges.forEach((c, i) => {
    if (slugs.has(c.slug)) issue(ctx, ['colleges', i, 'slug'], `duplicate college slug ${c.slug}`);
    slugs.add(c.slug);
    c.programs.forEach((p, j) => {
      const key = `${c.slug} ${p.sport}`;
      if (programs.has(key)) issue(ctx, ['colleges', i, 'programs', j, 'sport'], `${c.slug} has two ${p.sport} programs`);
      programs.add(key);
    });
  });
  const players = new Set<string>();
  const committedTo = new Set<string>();
  f.commitments.forEach((c, i) => {
    if (!slugs.has(c.college)) {
      issue(ctx, ['commitments', i, 'college'], `${c.college} is not a college in colleges[]`);
    } else if (!programs.has(`${c.college} ${c.sport}`)) {
      issue(ctx, ['commitments', i, 'sport'], `${c.college} has no ${c.sport} program in colleges[]`);
    }
    committedTo.add(c.college);
    committedTo.add(`${c.college} ${c.sport}`);
    // ISO prefixes compare as strings: '2026-06' against '2026-10', '2026' against '2026'.
    if (c.asOf !== null && c.asOf > f.capturedAt.slice(0, c.asOf.length)) {
      issue(ctx, ['commitments', i, 'asOf'], `${c.asOf} is after the research date ${f.capturedAt}`);
    }
    const key = `${c.teamSlug} ${c.athleteId}`;
    if (players.has(key)) {
      issue(ctx, ['commitments', i], `a second commitment for ${c.teamSlug} / ${c.fullName}: a player has one`);
    }
    players.add(key);
  });
  f.colleges.forEach((c, i) => {
    if (!committedTo.has(c.slug)) {
      issue(ctx, ['colleges', i], `no commitment names ${c.slug}: drop the college record`);
      return;
    }
    c.programs.forEach((p, j) => {
      if (!committedTo.has(`${c.slug} ${p.sport}`)) {
        issue(ctx, ['colleges', i, 'programs', j], `no ${p.sport} commitment names ${c.slug}: drop the program`);
      }
    });
  });
}

export const CommitsFileSchema = CommitsFileObject.superRefine(checkCommitsFile);

export type CollegeSource = z.infer<typeof CollegeSourceSchema>;
export type CollegeProgram = z.infer<typeof CollegeProgramSchema>;
export type College = z.infer<typeof CollegeSchema>;
export type CommitSource = z.infer<typeof CommitSourceSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
export type CommitsFile = z.infer<typeof CommitsFileSchema>;
