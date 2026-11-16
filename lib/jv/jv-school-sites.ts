/**
 * JV results published by a school itself: a third JV source after MaxPreps and si.com, applied by lib/jv/jv.ts
 * after the si.com merge (lib/jv/jv-merge.ts) and on the same terms.
 *
 * Few schools publish JV results at all. A sweep of 2026-11-03 for every past JV league game neither
 * MaxPreps nor si.com had a score for found two that do, both Sidearm sites listing each JV game with its
 * result: Saint Francis (sfhsathletics.com, "SCVAL - DeAnza" on each league line) and St. Ignatius
 * (siwildcats.com). Where they and MaxPreps both have a final they agree on all but one score (St.
 * Ignatius at Homestead, Sep 21: 6-0 on St. Ignatius' page, 5-0 on MaxPreps), and the two pages agree on
 * both of their games against each other. Cupertino's and Mitty's schedules, Huntington Beach's program
 * site and the MCAL's schedule page give dates only, and no other school's site was found with JV results.
 *
 * Homestead's athletic director's weekly update (a Google Doc, given by the owner on 2026-11-15) is the third: each
 * week's issue lists the varsity and JV results of the week before, a JV game as "Won 1 - 0 vs Cupertino" or, when
 * no score was reported, "Played @ Leigh". Its "vs" and "@" are not reliable for the JV lines (the JV game at Saint
 * Ignatius on Oct 14 reads "vs Saint Ignatius"), so the host and start time of each row are the issue's own
 * schedule of the week ("Field Hockey @ Los Altos ... JV - 5:15 pm"). Its scores agree with MaxPreps' on every game
 * but one (Los Gatos at Homestead, Sep 2: 3-1 there, 3-2 on MaxPreps); its Aug 31 game against "Saint Francis
 * (Freshman)", which MaxPreps files as Saint Francis' JV, is left out.
 *
 * Fremont's athletics site (given by the owner on 2026-11-15) is the fourth: its field hockey page embeds a
 * published Google Sheet of the season with each result as "Varsity / JV" ("W 3-2 / W 4-0", winner's score
 * first). Its varsity scores match MaxPreps' on all 22 games. Its JV scores agree with every JV score we already
 * had but two, and both rows are left out so the committed pages never disagree: Sep 9 v Saint Francis ("L 4-0";
 * 5-0 on Saint Francis' page) and Sep 28 v St. Ignatius ("6-0" with no W/L; 7-0 on St. Ignatius' page). Its JV
 * start is the time after the slash; its "No JV" games (Presentation, Valley Christian twice) have no row.
 *
 * Santa Clara's athletics site (Home Campus, given by the owner on 2026-11-16) is the fifth: its JV schedule & results
 * page scores all 13 of Santa Clara's JV games. MaxPreps agrees on 11; on the other two (at Monta Vista Sep 10, 4-0
 * there and 3-0 on MaxPreps; Los Gatos Sep 15, 12-0 there and 7-2 on MaxPreps) si.com agrees with Santa Clara, so
 * lib/jv/jv-corrections.ts rescores those MaxPreps rows before the merge and every row here agrees.
 *
 * The rows below were read from those pages on 2026-11-03 (2026-11-15 for Homestead and Fremont, 2026-11-16 for Santa Clara) and are transcribed,
 * not fetched on each run: the JV league season was over by then, and a re-read would add a scraper for four pages.
 * Each row is one game from the page's school's side.
 *
 * The rules, the si.com merge's (MaxPreps first):
 *   1. a game the two schools' pages both list is used only when they agree;
 *   2. matched to a JV game of the same registry pair within ±1 day, used at most once: a final with
 *      another score keeps its score and the school's is noted beside it; a past game with no score (not
 *      postponed) takes the school's, marked `provenance.scores: 'school-site'` (the †);
 *   3. a game with no JV game of the pair within ±14 days is added (`school:<slug>:<date>:<opponent>`): a final,
 *      or, for a game the page lists as played with no score, a past game with no score (status 'score-pending').
 *      A game with no score never fills or contradicts one (rule 2 leaves the matched game as it is).
 *
 * Pure: no I/O, no clock.
 */

import { dayDiff, byDateThenId, toLocalTimestamp } from '../format';
import { getTeamBySlug } from '../teams';
import type { ContestId, Game, GameSide, Outcome, TeamSlug } from '../types';
import { IS_FIELD_HOCKEY } from '../sports/current';

export interface JvSchoolSiteGame {
  dateKey: string;
  /** Wall-clock start, HH:MM, as the page prints it. */
  time: string;
  opponent: TeamSlug;
  /** The page's school hosted. */
  home: boolean;
  /** The page's school's goals, then the opponent's; null for a game the page lists as played with no score. */
  score: [number, number] | null;
  /** The opponent forfeited ("Los Altos Forfeit"). */
  opponentForfeit?: true;
}

export interface JvSchoolSite {
  school: TeamSlug;
  /** The JV schedule page read. */
  url: string;
  readOn: string;
  /** Short words for the page, as a note names it: "Saint Francis’ athletics site". */
  label: string;
  games: readonly JvSchoolSiteGame[];
}

const FIELD_HOCKEY_JV_SCHOOL_SITES: readonly JvSchoolSite[] = [
  {
    school: 'saint-francis',
    url: 'https://sfhsathletics.com/sports/jv-field-hockey/schedule',
    readOn: '2026-11-03',
    label: 'Saint Francis’ athletics site',
    games: [
      { dateKey: '2026-09-01', time: '17:15', opponent: 'leigh', home: false, score: [8, 0] },
      { dateKey: '2026-09-03', time: '17:15', opponent: 'christopher', home: true, score: [6, 0] },
      { dateKey: '2026-09-09', time: '17:15', opponent: 'fremont', home: false, score: [5, 0] },
      { dateKey: '2026-09-14', time: '17:15', opponent: 'cupertino', home: true, score: [4, 0] },
      { dateKey: '2026-09-16', time: '17:15', opponent: 'los-altos', home: false, score: [2, 0] },
      { dateKey: '2026-09-22', time: '17:15', opponent: 'gilroy', home: true, score: [9, 0] },
      { dateKey: '2026-09-23', time: '17:15', opponent: 'st-ignatius', home: false, score: [1, 0] },
      { dateKey: '2026-09-28', time: '17:15', opponent: 'homestead', home: true, score: [10, 0] },
      { dateKey: '2026-10-05', time: '17:15', opponent: 'fremont', home: true, score: [3, 0] },
      { dateKey: '2026-10-07', time: '16:45', opponent: 'cupertino', home: false, score: [10, 0] },
      { dateKey: '2026-10-12', time: '17:15', opponent: 'los-altos', home: true, score: [6, 0] },
      { dateKey: '2026-10-19', time: '16:45', opponent: 'st-ignatius', home: true, score: [1, 0] },
      { dateKey: '2026-10-21', time: '16:45', opponent: 'homestead', home: false, score: [3, 0] },
      { dateKey: '2026-10-27', time: '16:45', opponent: 'mitty', home: false, score: [2, 1] },
    ],
  },
  {
    school: 'st-ignatius',
    url: 'https://siwildcats.com/sports/jv-field-hockey/schedule',
    readOn: '2026-11-03',
    label: 'St. Ignatius’ athletics site',
    games: [
      { dateKey: '2026-08-31', time: '17:15', opponent: 'tamalpais', home: true, score: [2, 0] },
      { dateKey: '2026-09-10', time: '17:15', opponent: 'mitty', home: false, score: [3, 0] },
      { dateKey: '2026-09-21', time: '17:15', opponent: 'homestead', home: false, score: [6, 0] },
      { dateKey: '2026-09-23', time: '17:15', opponent: 'saint-francis', home: true, score: [0, 1] },
      { dateKey: '2026-09-28', time: '17:15', opponent: 'fremont', home: false, score: [7, 0] },
      { dateKey: '2026-09-30', time: '17:15', opponent: 'cupertino', home: true, score: [7, 0] },
      { dateKey: '2026-10-05', time: '17:15', opponent: 'los-altos', home: true, score: [5, 0] },
      { dateKey: '2026-10-08', time: '17:15', opponent: 'los-altos', home: false, score: [1, 0], opponentForfeit: true },
      { dateKey: '2026-10-14', time: '16:45', opponent: 'homestead', home: true, score: [8, 0] },
      { dateKey: '2026-10-19', time: '16:45', opponent: 'saint-francis', home: false, score: [0, 1] },
      { dateKey: '2026-10-21', time: '16:45', opponent: 'fremont', home: true, score: [4, 0] },
      { dateKey: '2026-10-26', time: '16:45', opponent: 'cupertino', home: false, score: [8, 0] },
    ],
  },
  {
    school: 'homestead',
    url: 'https://docs.google.com/document/d/1t2Gq_2HQvs8_9pm8yEnIqZzV9UkPv9H9NYCTSIaeKK8/edit',
    readOn: '2026-11-15',
    label: 'Homestead’s athletic director’s weekly update',
    games: [
      { dateKey: '2026-09-02', time: '16:00', opponent: 'los-gatos', home: true, score: [1, 3] },
      { dateKey: '2026-09-04', time: '16:00', opponent: 'lynbrook', home: true, score: [2, 1] },
      // Scheduled Wed Sep 9 at Cupertino, 5:15 PM; played Fri Sep 11 (lib/jv/jv-corrections.ts dateMoves).
      { dateKey: '2026-09-11', time: '17:15', opponent: 'cupertino', home: false, score: [1, 2] },
      { dateKey: '2026-09-14', time: '17:30', opponent: 'los-altos', home: true, score: [0, 3] },
      { dateKey: '2026-09-15', time: '17:00', opponent: 'leigh', home: false, score: null },
      { dateKey: '2026-09-28', time: '17:15', opponent: 'saint-francis', home: false, score: [0, 10] },
      // The issue dates it "Monday 10/7"; the Monday of that week is Oct 5, the day of the varsity game.
      { dateKey: '2026-10-05', time: '17:15', opponent: 'cupertino', home: true, score: [1, 0] },
      { dateKey: '2026-10-07', time: '17:15', opponent: 'los-altos', home: false, score: null },
      { dateKey: '2026-10-13', time: '15:30', opponent: 'cupertino', home: true, score: [1, 0] },
      { dateKey: '2026-10-14', time: '16:45', opponent: 'st-ignatius', home: false, score: [0, 8] },
    ],
  },
  {
    school: 'fremont',
    // The page embeds the schedule as a published Google Sheet, "FHS Field Hockey Schedule 2026-2027".
    url: 'https://www.fremonthsathletics.org/field-hockey#fhschedule',
    readOn: '2026-11-15',
    label: 'Fremont’s athletics site',
    games: [
      { dateKey: '2026-08-27', time: '17:15', opponent: 'santa-clara', home: true, score: [4, 0] },
      { dateKey: '2026-08-28', time: '17:15', opponent: 'cupertino', home: false, score: [1, 0] },
      { dateKey: '2026-09-01', time: '17:15', opponent: 'monta-vista', home: true, score: [4, 0] },
      // Sep 9 v Saint Francis left out: "L 4-0" here, 5-0 on Saint Francis' page (kept above).
      { dateKey: '2026-09-11', time: '17:15', opponent: 'lynbrook', home: false, score: [4, 0] },
      { dateKey: '2026-09-16', time: '17:15', opponent: 'cupertino', home: false, score: [1, 0] },
      { dateKey: '2026-09-18', time: '17:15', opponent: 'homestead', home: true, score: [3, 0] },
      { dateKey: '2026-09-21', time: '17:15', opponent: 'los-altos', home: true, score: [0, 2] },
      { dateKey: '2026-09-23', time: '17:15', opponent: 'prospect', home: false, score: [3, 0] },
      { dateKey: '2026-09-24', time: '16:45', opponent: 'bella-vista', home: true, score: [3, 0] },
      // Sep 28 v St. Ignatius left out: "6-0" here (no W/L), 7-0 on St. Ignatius' page (kept above).
      { dateKey: '2026-09-30', time: '17:15', opponent: 'homestead', home: false, score: [2, 0] },
      { dateKey: '2026-10-02', time: '16:45', opponent: 'carmel', home: true, score: [2, 0] },
      { dateKey: '2026-10-05', time: '17:15', opponent: 'saint-francis', home: false, score: [0, 3] },
      { dateKey: '2026-10-14', time: '15:30', opponent: 'los-altos', home: false, score: [1, 0] },
      { dateKey: '2026-10-16', time: '16:45', opponent: 'cupertino', home: true, score: [4, 0] },
      { dateKey: '2026-10-19', time: '16:45', opponent: 'palo-alto', home: false, score: [6, 0] },
      { dateKey: '2026-10-21', time: '16:45', opponent: 'st-ignatius', home: false, score: [0, 4] },
      { dateKey: '2026-10-28', time: '16:45', opponent: 'homestead', home: true, score: [2, 2] },
    ],
  },
  {
    school: 'santa-clara',
    // Home Campus: the list loads by script (admin-ajax.php load_schedule_results_full, level_id 10, year 2026-27).
    url: 'https://www.schsathletics.com/lower/field-hockey-junior-varsity/schedule-results/',
    readOn: '2026-11-16',
    label: 'Santa Clara’s athletics site',
    games: [
      { dateKey: '2026-08-24', time: '17:15', opponent: 'homestead', home: false, score: [0, 4] },
      { dateKey: '2026-08-27', time: '17:15', opponent: 'fremont', home: false, score: [0, 4] },
      { dateKey: '2026-09-01', time: '17:30', opponent: 'cupertino', home: false, score: [0, 2] },
      { dateKey: '2026-09-10', time: '17:20', opponent: 'monta-vista', home: false, score: [0, 4] },
      { dateKey: '2026-09-15', time: '17:20', opponent: 'los-gatos', home: true, score: [0, 12] },
      { dateKey: '2026-09-17', time: '17:20', opponent: 'mitty', home: false, score: [0, 7] },
      { dateKey: '2026-09-29', time: '17:20', opponent: 'palo-alto', home: true, score: [2, 2] },
      // "vs Lynbrook" with no venue; MaxPreps has Lynbrook at Santa Clara too.
      { dateKey: '2026-10-01', time: '17:20', opponent: 'lynbrook', home: true, score: [0, 1] },
      { dateKey: '2026-10-06', time: '17:20', opponent: 'monta-vista', home: true, score: [0, 1] },
      { dateKey: '2026-10-08', time: '17:30', opponent: 'los-gatos', home: false, score: [0, 6] },
      { dateKey: '2026-10-13', time: '16:45', opponent: 'mitty', home: true, score: [0, 7] },
      { dateKey: '2026-10-22', time: '16:45', opponent: 'palo-alto', home: false, score: [2, 4] },
      { dateKey: '2026-10-27', time: '17:30', opponent: 'lynbrook', home: false, score: [1, 7] },
    ],
  },
];

/** This build's school JV sites: field hockey's; none yet for soccer. */
export const JV_SCHOOL_SITES: readonly JvSchoolSite[] = IS_FIELD_HOCKEY ? FIELD_HOCKEY_JV_SCHOOL_SITES : [];

/** Rule 2: a school-site game within this many days of a JV game of the pair matches it. */
export const JV_SCHOOL_SITE_DATE_TOLERANCE_DAYS = 1;
/** Rule 3 precondition: no JV game of the pair within this many days. */
export const JV_SCHOOL_SITE_PAIR_WINDOW_DAYS = 14;

/** One game as the school pages give it, both sides named, from host's side. */
export interface JvSchoolSiteResult {
  key: string;
  dateKey: string;
  dateLocal: string;
  home: TeamSlug;
  away: TeamSlug;
  /** Both null for a game the page lists with no score. */
  homeScore: number | null;
  awayScore: number | null;
  forfeitBy: 'home' | 'away' | null;
  sites: JvSchoolSite[];
}

export type JvSchoolSiteUnusedReason = 'pages-disagree' | 'ambiguous' | 'pair-nearby' | 'not-needed';

export interface JvSchoolSiteMergeResult {
  games: Game[];
  filled: ContestId[];
  added: ContestId[];
  /** Finals the school's page scores differently: the game, and the sentence shown under it. */
  differs: Array<{ contestId: ContestId; note: string }>;
  unused: Array<{ key: string; reason: JvSchoolSiteUnusedReason }>;
}

function pairKey(a: TeamSlug, b: TeamSlug): string {
  return [a, b].sort().join('~');
}

function outcome(mine: number, theirs: number): Outcome {
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
}

function pacificToUtc(dateLocal: string): string {
  for (const hours of [7, 8]) {
    const iso = new Date(Date.parse(`${dateLocal}Z`) + hours * 3_600_000).toISOString().replace('.000Z', 'Z');
    if (toLocalTimestamp(iso) === dateLocal) return iso;
  }
  throw new Error(`jv-school-sites: no Pacific instant for ${dateLocal}`);
}

/** Every page's games as host-side results; a game two pages list is one result, or none when they disagree. */
export function schoolSiteResults(sites: readonly JvSchoolSite[] = JV_SCHOOL_SITES): {
  results: JvSchoolSiteResult[];
  disagree: string[];
} {
  const byKey = new Map<string, JvSchoolSiteResult>();
  const disagree = new Set<string>();
  for (const site of sites) {
    for (const g of site.games) {
      const home = g.home ? site.school : g.opponent;
      const away = g.home ? g.opponent : site.school;
      const [mine, theirs] = g.score ?? [null, null];
      const r: JvSchoolSiteResult = {
        key: `${g.dateKey}:${away}@${home}`,
        dateKey: g.dateKey,
        dateLocal: `${g.dateKey}T${g.time}:00`,
        home,
        away,
        homeScore: g.home ? mine : theirs,
        awayScore: g.home ? theirs : mine,
        forfeitBy: g.opponentForfeit ? (g.home ? 'away' : 'home') : null,
        sites: [site],
      };
      const prev = byKey.get(r.key);
      if (!prev) byKey.set(r.key, r);
      else if (prev.homeScore === r.homeScore && prev.awayScore === r.awayScore && prev.forfeitBy === r.forfeitBy) {
        prev.sites.push(site);
      } else disagree.add(r.key);
    }
  }
  return { results: [...byKey.values()].filter((r) => !disagree.has(r.key)), disagree: [...disagree] };
}

function sitesWords(r: JvSchoolSiteResult): string {
  return r.sites.map((s) => s.label).join(' and ');
}

/** The sentence under a final a school's page scores differently. */
function differsNote(_g: Game, r: JvSchoolSiteResult): string {
  const name = (slug: TeamSlug) => getTeamBySlug(slug)?.shortName ?? slug;
  const [cap, ...rest] = sitesWords(r);
  return `${cap.toUpperCase()}${rest.join('')} has ${name(r.away)} ${r.awayScore}, ${name(r.home)} ${r.homeScore}; MaxPreps’ score is shown.`;
}

function scored(g: Game, r: JvSchoolSiteResult & { homeScore: number; awayScore: number }, url: string): Game {
  const flip = g.home.slug !== r.home;
  const homeScore = flip ? r.awayScore : r.homeScore;
  const awayScore = flip ? r.homeScore : r.awayScore;
  const forfeitBy = r.forfeitBy === null ? null : flip ? (r.forfeitBy === 'home' ? 'away' : 'home') : r.forfeitBy;
  return {
    ...g,
    home: { ...g.home, score: homeScore, result: outcome(homeScore, awayScore) },
    away: { ...g.away, score: awayScore, result: outcome(awayScore, homeScore) },
    status: 'final',
    otPeriods: 0,
    isOt: false,
    isForfeit: forfeitBy !== null,
    forfeitBy,
    decider: forfeitBy !== null ? 'FORFEIT' : 'REG',
    shootout: null,
    urls: { ...g.urls, school: url },
    provenance: { ...g.provenance, scores: 'school-site' },
  };
}

function sideOf(slug: TeamSlug, score: number | null, other: number | null): GameSide {
  const team = getTeamBySlug(slug);
  if (!team) throw new Error(`jv-school-sites: ${slug} is not a registry team`);
  return { teamId: team.id, slug, name: team.name, score, result: score === null || other === null ? null : outcome(score, other) };
}

function addedGame(r: JvSchoolSiteResult, fetchedAt: string): Game {
  const home = getTeamBySlug(r.home)!;
  const away = getTeamBySlug(r.away)!;
  const hasScore = r.homeScore !== null && r.awayScore !== null;
  return {
    contestId: `school:${r.sites[0].school}:${r.dateKey}:${r.home === r.sites[0].school ? r.away : r.home}`,
    dateLocal: r.dateLocal,
    dateUtc: pacificToUtc(r.dateLocal),
    dateKey: r.dateKey,
    isDateTba: false,
    isTimeTba: false,
    home: sideOf(r.home, r.homeScore, r.awayScore),
    away: sideOf(r.away, r.awayScore, r.homeScore),
    site: 'home',
    // Only past games are added (mergeJvSchoolSites), so one with no score is a played game awaiting it.
    status: hasScore ? 'final' : 'score-pending',
    isLeague: false,
    leagueDivision: home.division === away.division ? home.division : null,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: r.forfeitBy !== null,
    forfeitBy: r.forfeitBy,
    decider: !hasScore ? null : r.forfeitBy !== null ? 'FORFEIT' : 'REG',
    shootout: null,
    venue: { text: null },
    urls: { maxpreps: null, school: r.sites[0].url, nfhsStream: null, goFan: null },
    provenance: { scores: 'school-site', schedule: 'school-site', fetchedAt },
  };
}

export function mergeJvSchoolSites(input: {
  games: readonly Game[];
  sites?: readonly JvSchoolSite[];
  /** YYYY-MM-DD, Pacific: the JV file's fetchedAt date. */
  today: string;
  /** Stamped on an added game's provenance: when the transcription was read. */
  fetchedAt: string;
}): JvSchoolSiteMergeResult {
  const { results, disagree } = schoolSiteResults(input.sites);
  const unused: JvSchoolSiteMergeResult['unused'] = disagree.map((key) => ({ key, reason: 'pages-disagree' as const }));
  const used = new Set<string>();
  const filled: ContestId[] = [];
  const differs: JvSchoolSiteMergeResult['differs'] = [];

  const games = input.games.map((g) => {
    if (!g.home.slug || !g.away.slug) return g;
    const key = pairKey(g.home.slug, g.away.slug);
    const near = results
      .filter((r) => !used.has(r.key) && pairKey(r.home, r.away) === key)
      .map((r) => ({ r, d: Math.abs(dayDiff(g.dateKey, r.dateKey)) }))
      .filter(({ d }) => d <= JV_SCHOOL_SITE_DATE_TOLERANCE_DAYS)
      .sort((a, b) => a.d - b.d);
    if (near.length === 0) return g;
    if (near.length > 1 && near[0].d === near[1].d) {
      for (const { r } of near) {
        used.add(r.key);
        unused.push({ key: r.key, reason: 'ambiguous' });
      }
      return g;
    }
    const r = near[0].r;
    used.add(r.key);
    if (r.homeScore === null || r.awayScore === null) {
      unused.push({ key: r.key, reason: 'not-needed' });
      return g;
    }
    const flip = g.home.slug !== r.home;
    const homeScore = flip ? r.awayScore : r.homeScore;
    const awayScore = flip ? r.homeScore : r.awayScore;
    if (g.status === 'final') {
      if (g.home.score !== homeScore || g.away.score !== awayScore) differs.push({ contestId: g.contestId, note: differsNote(g, r) });
      else unused.push({ key: r.key, reason: 'not-needed' });
      return g;
    }
    if (g.status === 'postponed' || g.dateKey > input.today) {
      unused.push({ key: r.key, reason: 'not-needed' });
      return g;
    }
    filled.push(g.contestId);
    return scored(g, { ...r, homeScore: r.homeScore, awayScore: r.awayScore }, r.sites[0].url);
  });

  const added: Game[] = [];
  for (const r of results) {
    if (used.has(r.key)) continue;
    const key = pairKey(r.home, r.away);
    const nearby = games.some(
      (g) =>
        g.home.slug &&
        g.away.slug &&
        pairKey(g.home.slug, g.away.slug) === key &&
        Math.abs(dayDiff(g.dateKey, r.dateKey)) <= JV_SCHOOL_SITE_PAIR_WINDOW_DAYS,
    );
    if (nearby || r.dateKey > input.today) {
      unused.push({ key: r.key, reason: nearby ? 'pair-nearby' : 'not-needed' });
      continue;
    }
    added.push(addedGame(r, input.fetchedAt));
  }

  return {
    games: [...games, ...added].sort(byDateThenId),
    filled,
    added: added.map((g) => g.contestId),
    differs,
    unused: unused.sort((a, b) => a.key.localeCompare(b.key)),
  };
}
