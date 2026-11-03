/**
 * League configuration: LEAGUES, assembled from lib/league-config/ (SPEC §2; the Southern California amendment,
 * DESIGN-socal §2.1), the ids derived from it and the lookups over it. The facts themselves (every region,
 * section, league, division, rule, tiebreak chain, citation, ladder, pairing, phase, date and official source)
 * live in lib/league-config/: shape.ts (the types), sections.ts (regions, sections, the CCS block),
 * data-quality.ts, sds.ts (what the San Diego leagues share) and one file per league, named as its
 * lib/registry/*.ts seeds. Nothing else in the codebase names a league, a division or a by-law; teams live in
 * lib/registry/* and are assembled by lib/teams.ts.
 *
 * Pure data plus small helpers: no fs, no lib/data import, no snapshot. `assertLeagues()` runs at
 * module load and throws `lib/leagues.ts: <message>` on any violated invariant (SPEC §2.4).
 */

import { BVAL } from './league-config/bval';
import { CITY } from './league-config/city';
import { DATA_QUALITY } from './league-config/data-quality';
import { EAL } from './league-config/eal';
import { INDEPENDENTS } from './league-config/independents';
import { MCAL } from './league-config/mcal';
import { METRO } from './league-config/metro';
import { NORTH_COUNTY } from './league-config/north-county';
import { PCAL } from './league-config/pcal';
import { SCVAL } from './league-config/scval';
import { CCS, REGIONS, SECTIONS } from './league-config/sections';
import {
  SHOOTOUT_INFERENCES,
  type DivisionConfig, type LadderRung, type LeagueConfig, type LeagueRules, type PairingConfig,
  type PostseasonConfig, type RegionConfig, type SectionConfig,
} from './league-config/shape';
import { SUNSET } from './league-config/sunset';
import type {
  DivisionId, LeagueId, PlayoffStatus, RegionId, SectionId, TeamSlug, TiebreakStage,
} from './types';
// Besides lib/league-config/, the runtime imports are two leaves: lib/season.ts (dependency-free constants)
// and lib/schema-primitives.ts, for its date-key RegExp (that module imports nothing of ours, only zod).
import { DATE_PATTERN, SLUG_PATTERN } from './schema-primitives';
import { SEASON_YEAR } from './season';

const MP = 'https://www.maxpreps.com';

/**
 * Config order: NorCal (CCS, NCS, NS) first, then SoCal (the Sunset, then the San Diego leagues, then the Southern
 * Section independents, a group of schools in no league with a table of their games against each other).
 */
export const LEAGUES: readonly LeagueConfig[] = [SCVAL, BVAL, PCAL, MCAL, EAL, SUNSET, CITY, NORTH_COUNTY, METRO, INDEPENDENTS];

/**
 * Route segments a league id may never equal (siblings of /standings/[league], /schedule/[league],
 * /playoffs/[league]), plus the two region ids: 'norcal' and 'socal' are page anchors and `data-region-scope`
 * values (DESIGN-socal §2.4), so no section, league or division may take one (asserted).
 */
export const RESERVED_SEGMENTS = [
  'opengraph-image', 'twitter-image', 'icon', 'apple-icon', 'sitemap', 'robots', 'manifest', 'norcal', 'socal',
] as const;

// ---------- helpers (the Stage-A API, SPEC §2.3) ----------

export const LEAGUE_IDS: readonly LeagueId[] = LEAGUES.map((l) => l.id);

/** Every division, config order (LEAGUES order, then each league's division order). */
export const ALL_DIVISIONS: readonly DivisionConfig[] = LEAGUES.flatMap((l) => l.divisions);

/** Leagues whose postseason is the CCS ladder. */
export const CCS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'ccs-ladder',
).map((l) => l.id);

/** Leagues that run their own tournament (['mcal']). */
export const TOURNAMENT_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'league-tournament',
).map((l) => l.id);

/** Leagues whose postseason is a tournament with no published bracket (['eal']). */
export const UNBRACKETED_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'unbracketed-tournament',
).map((l) => l.id);

/** Leagues with no postseason at all (['sunset', 'independents']): /playoffs gives each a card of its own. */
export const NO_POSTSEASON_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'no-postseason',
).map((l) => l.id);

/**
 * Whether the league is a group of independents (LeagueConfig.independents: the Southern Section
 * independents). Every reader that names the group, or counts "leagues", branches on this, never on the id.
 */
/**
 * A league's words where its short name would stand alone as a control's target ('Jump to … ↓',
 * 'Show … here'): `LeagueConfig.standaloneName`, else the short name.
 */
export function standaloneName(id: LeagueId): string {
  const league = getLeague(id);
  return league.standaloneName ?? league.shortName;
}

export function isIndependentLeague(id: LeagueId): boolean {
  return LEAGUE_BY_ID.get(id)?.independents === true;
}

/**
 * The league's name with the sport, for copy that says what a page covers: 'Santa Clara Valley Athletic
 * League girls varsity field hockey', but 'Sunset field hockey league, girls varsity', whose own name
 * already says the sport (never "… field hockey league girls varsity field hockey").
 */
export function leagueSportWords(id: LeagueId): string {
  const { name } = getLeague(id);
  return /field hockey/i.test(name) ? `${name}, girls varsity` : `${name} girls varsity field hockey`;
}

/** '<SHORT> standings' as a link's or a title's words ('LA standings' for the LA independents). */
export function standingsLabel(id: LeagueId): string {
  return `${getLeague(id).shortName} standings`;
}

/** Whether the division belongs to a group of independents (LeagueConfig.independents). */
export function isIndependentDivision(id: DivisionId): boolean {
  const d = DIVISION_BY_ID.get(id);
  return d !== undefined && isIndependentLeague(d.leagueId);
}

/**
 * The leagues proper, config order: every entry of LEAGUES but a group of independents. Copy that counts
 * leagues ("all nine leagues") counts these, and names the independents separately where it matters
 * ("and the Southern Section’s five independents"); it never prints "ten leagues".
 */
export const LEAGUES_PROPER: readonly LeagueConfig[] = LEAGUES.filter((l) => l.independents !== true);

/** The groups of independents, config order (one today: the LA independents). */
export const INDEPENDENT_LEAGUES: readonly LeagueConfig[] = LEAGUES.filter((l) => l.independents === true);

/** Leagues whose postseason is their section's own playoffs (['city', 'north-county', 'metro']). */
export const SECTION_PLAYOFFS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'section-playoffs',
).map((l) => l.id);

const REGION_BY_ID = new Map<string, RegionConfig>(REGIONS.map((r) => [r.id, r]));
const SECTION_BY_ID = new Map<string, SectionConfig>(SECTIONS.map((s) => [s.id, s]));
const LEAGUE_BY_ID = new Map<string, LeagueConfig>(LEAGUES.map((l) => [l.id, l]));
const DIVISION_BY_ID = new Map<string, DivisionConfig>(ALL_DIVISIONS.map((d) => [d.id, d]));

/** Throws on an unknown id. */
export function getRegion(id: RegionId): RegionConfig {
  const r = REGION_BY_ID.get(id);
  if (!r) throw new Error(`lib/leagues.ts: unknown region "${id}"`);
  return r;
}

/** A league's region: its section's (never stored). Throws on an unknown league. */
export function regionOf(leagueId: LeagueId): RegionId {
  return sectionOf(leagueId).region;
}

/** The region's sections, config order. */
export function sectionsInRegion(region: RegionId): readonly SectionConfig[] {
  return SECTIONS.filter((s) => s.region === region);
}

/** The region's leagues, config order (LEAGUES lists NorCal first, so each region is one contiguous run). */
export function leaguesInRegion(region: RegionId): readonly LeagueConfig[] {
  return LEAGUES.filter((l) => regionOf(l.id) === region);
}

/** Throws on an unknown id. */
export function getSection(id: SectionId): SectionConfig {
  const s = SECTION_BY_ID.get(id);
  if (!s) throw new Error(`lib/leagues.ts: unknown section "${id}"`);
  return s;
}

export function sectionOf(leagueId: LeagueId): SectionConfig {
  return getSection(getLeague(leagueId).sectionId);
}

/** Throws on an unknown id (a build-time bug). */
export function getLeague(id: LeagueId): LeagueConfig {
  const l = LEAGUE_BY_ID.get(id);
  if (!l) throw new Error(`lib/leagues.ts: unknown league "${id}"`);
  return l;
}

export function findLeague(id: string): LeagueConfig | undefined {
  return LEAGUE_BY_ID.get(id);
}

export function isLeagueId(id: string): boolean {
  return LEAGUE_BY_ID.has(id);
}

/** Throws on an unknown id. */
export function getDivision(id: DivisionId): DivisionConfig {
  const d = DIVISION_BY_ID.get(id);
  if (!d) throw new Error(`lib/leagues.ts: unknown division "${id}"`);
  return d;
}

export function findDivision(id: string): DivisionConfig | undefined {
  return DIVISION_BY_ID.get(id);
}

export function leagueOfDivision(id: DivisionId): LeagueConfig {
  return getLeague(getDivision(id).leagueId);
}

export function divisionsOf(leagueId: LeagueId): readonly DivisionConfig[] {
  return getLeague(leagueId).divisions;
}

export function isSingleDivision(leagueId: LeagueId): boolean {
  return getLeague(leagueId).divisions.length === 1;
}

/** 'De Anza' | 'Mt. Hamilton' | 'PCAL' | 'MCAL' | 'EAL' */
export function divisionLabel(id: DivisionId): string {
  return getDivision(id).label;
}

/** THE single gate for division labels: null for a single-division league. */
export function divisionHeading(id: DivisionId): string | null {
  const d = getDivision(id);
  return isSingleDivision(d.leagueId) ? null : d.label;
}

/** 'BVAL · Mt. Hamilton' | 'MCAL' | 'SCVAL · De Anza' */
export function divisionDisplay(id: DivisionId): string {
  const league = leagueOfDivision(id);
  const heading = divisionHeading(id);
  return heading === null ? league.shortName : `${league.shortName} · ${heading}`;
}

/**
 * MaxPreps league standings page — the deep link on every standings table. The double hyphen in
 * the slug is the league name's " - " joiner; dropping ?leagueid= hard-404s. null for a division
 * MaxPreps has no table for (the San Diego Section's Valley): never '/league/null/'.
 */
export function leagueStandingsUrl(id: DivisionId): string | null {
  const d = getDivision(id);
  if (d.maxprepsLeagueId === null || d.maxprepsSlug === null) return null;
  return `${MP}/ca/field-hockey/${SEASON_YEAR}/league/${d.maxprepsSlug}/?leagueid=${d.maxprepsLeagueId}`;
}

/** The rungs of the division's league ladder that apply to this division, in ladder order. */
export function ladderFor(id: DivisionId): readonly LadderRung[] {
  const d = getDivision(id);
  return getLeague(d.leagueId).postseason.ladder.filter(
    (r) => r.divisions === '*' || r.divisions.includes(d.id),
  );
}

/** The rung covering `place` (1-based; anything past 99 reads as 99). Throws when none does. */
export function ladderRung(id: DivisionId, place: number): LadderRung {
  const p = Math.min(Math.max(place, 1), 99);
  const rung = ladderFor(id).find((r) => r.places[0] <= p && p <= r.places[1]);
  if (!rung) throw new Error(`lib/leagues.ts: no ladder rung for ${id} place ${place}`);
  return rung;
}

/** The chain for a points bucket that starts at `bucketStartPlace` (byBucketStart entry, else default). */
export function tiebreakChainFor(id: DivisionId, bucketStartPlace: number): readonly TiebreakStage[] {
  const { tiebreaks } = leagueOfDivision(id).rules;
  return tiebreaks.byBucketStart?.[bucketStartPlace] ?? tiebreaks.default;
}

/**
 * A team's draw number (MCAL's spring draw: lower wins a `draw-number` stage). Takes a slug, so this
 * module never reads the registry; lib/teams.ts fails at import unless a league's `drawNumbers` keys are
 * exactly its slugs, so a miss here is a caller's bug and throws instead of falling back.
 */
export function drawNumberOf(rules: LeagueRules, slug: TeamSlug): number {
  const n = rules.drawNumbers?.[slug];
  if (n === undefined) throw new Error(`lib/leagues.ts: no draw number for ${slug}`);
  return n;
}

/** The dates a pairing's contest may be played on, inclusive: its `window`, else its `date` alone. */
export function pairingWindow(p: PairingConfig): { first: string; last: string } {
  return p.window ? { first: p.window.first, last: p.window.last } : { first: p.date, last: p.date };
}

/** true when a game dated `dateKey` (YYYY-MM-DD) falls inside the pairing's window. */
export function inPairingWindow(p: PairingConfig, dateKey: string): boolean {
  const w = pairingWindow(p);
  return dateKey >= w.first && dateKey <= w.last;
}

/** Every status the league's ladder can give, in ladder order, deduped. */
export function statusesOf(leagueId: LeagueId): readonly PlayoffStatus[] {
  return [...new Set(getLeague(leagueId).postseason.ladder.map((r) => r.status))];
}

/**
 * The first official league date of the league (min over its divisions): the date the home
 * PhaseLead and the /standings preseason notice both say league play starts.
 */
export function leaguePlayStarts(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.first)
    .reduce((a, b) => (b < a ? b : a));
}

/** The last official league date of the league (max over its divisions). */
export function leaguePlayEnds(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.last)
    .reduce((a, b) => (b > a ? b : a));
}

/** Union of every section's season window (the fetch season-window guard). */
export function seasonWindowBounds(): { start: string; end: string } {
  let start = SECTIONS[0].seasonWindow.start as string;
  let end = SECTIONS[0].seasonWindow.end as string;
  for (const s of SECTIONS) {
    if (s.seasonWindow.start < start) start = s.seasonWindow.start;
    if (s.seasonWindow.end > end) end = s.seasonWindow.end;
  }
  return { start, end };
}

// ---------- assertLeagues (SPEC §2.4) ----------

const UNCOMPUTABLE: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>(['coin-flip', 'ccs-points', 'no-rule']);
const CCS_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'aq', 'play-in', 'at-large', 'out', 'no-aq-route',
]);
const TOURNAMENT_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'bye', 'tournament', 'below-line',
]);
const UNBRACKETED_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'below-line']);
const NO_POSTSEASON_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['no-postseason']);
const SECTION_PLAYOFFS_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'selection']);
const PLACE_VS_STAGES: ReadonlySet<TiebreakStage> = new Set<TiebreakStage>([
  'record-vs-higher-placed', 'record-vs-lower-placed',
]);
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The ladder statuses a postseason kind may use. */
function allowedStatuses(kind: PostseasonConfig['kind']): ReadonlySet<PlayoffStatus> {
  switch (kind) {
    case 'ccs-ladder': return CCS_LADDER_STATUSES;
    case 'league-tournament': return TOURNAMENT_LADDER_STATUSES;
    case 'unbracketed-tournament': return UNBRACKETED_STATUSES;
    case 'no-postseason': return NO_POSTSEASON_STATUSES;
    case 'section-playoffs': return SECTION_PLAYOFFS_STATUSES;
  }
}

/** Every chain of a league with where it comes from: `null` = default, a number = byBucketStart key. */
function chainsOf(league: LeagueConfig): Array<{ start: number | null; chain: readonly TiebreakStage[] }> {
  const out: Array<{ start: number | null; chain: readonly TiebreakStage[] }> = [
    { start: null, chain: league.rules.tiebreaks.default },
  ];
  for (const [key, chain] of Object.entries(league.rules.tiebreaks.byBucketStart ?? {})) {
    if (chain) out.push({ start: Number(key), chain });
  }
  return out;
}

/** Runs at import. Throws `lib/leagues.ts: <message>` on the first violated invariant. */
export function assertLeagues(): void {
  const fail = (m: string): never => {
    throw new Error(`lib/leagues.ts: ${m}`);
  };
  const dupes = (values: readonly string[]): string[] => [
    ...new Set(values.filter((v, i) => values.indexOf(v) !== i)),
  ];

  // 1. ids
  const regionIds = REGIONS.map((r) => r.id as string);
  const sectionIds = SECTIONS.map((s) => s.id as string);
  const leagueIds = LEAGUES.map((l) => l.id);
  const divisionIds = ALL_DIVISIONS.map((d) => d.id);
  for (const [label, ids] of [
    ['region', regionIds], ['section', sectionIds], ['league', leagueIds], ['division', divisionIds],
  ] as const) {
    const d = dupes(ids);
    if (d.length) fail(`duplicate ${label} id: ${d.join(', ')}`);
  }
  // A region id is a page anchor and a data-region-scope value: reserved, and never a section, league or division.
  for (const id of regionIds) {
    if (!(RESERVED_SEGMENTS as readonly string[]).includes(id)) fail(`region ${id} is not a reserved segment`);
  }
  for (const id of [...sectionIds, ...leagueIds, ...divisionIds]) {
    if (regionIds.includes(id)) fail(`${id}: a section, league or division id may not be a region id`);
  }
  const shortDupes = dupes(SECTIONS.map((s) => s.shortName as string));
  if (shortDupes.length) fail(`duplicate section shortName: ${shortDupes.join(', ')}`);
  // 1b. sections: a known region each, every region used, a rules source, a well-formed shootout rule
  for (const s of SECTIONS as readonly SectionConfig[]) {
    if (!regionIds.includes(s.region)) fail(`${s.id}: unknown region ${s.region}`);
    if (!s.rulesSource.name.trim()) fail(`${s.id}: rulesSource needs a name`);
    if (!s.rulesSource.url.startsWith('https://')) fail(`${s.id}: rulesSource.url must start with https://`);
    if (s.shootout !== null && !(s.shootout.words.trim() && s.shootout.citation.trim())) {
      fail(`${s.id}: shootout needs words and a citation (use null for none)`);
    }
    // What copy may say about a level W/L final turns on the inference (lib/format.ts shootoutPhrases), so
    // every shootout rule names one: a typo or a missing value would silently print the 'verified' wording.
    if (s.shootout !== null && !(SHOOTOUT_INFERENCES as readonly string[]).includes(s.shootout.inference)) {
      fail(`${s.id}: shootout.inference must be one of ${SHOOTOUT_INFERENCES.join(', ')}`);
    }
    if (s.shootout !== null && (s.shootout.inference === 'unverified') !== Boolean(s.shootout.disagreement?.trim())) {
      fail(`${s.id}: shootout.disagreement is set exactly when the inference is 'unverified'`);
    }
    if (s.shootout !== null && typeof s.shootout.coversTournaments !== 'boolean') {
      fail(`${s.id}: shootout.coversTournaments must say whether the rule reaches a tournament game`);
    }
    // An outside tournament sits inside the section's season, its rounds inside its window, and it belongs to a
    // section whose leagues have no postseason of their own (its games are tagged ahead of MaxPreps' flag).
    const event = s.outsideTournament;
    if (event !== null) {
      const inSeason = (d: string) => d >= s.seasonWindow.start && d <= s.seasonWindow.end;
      if (!inSeason(event.window.first) || !inSeason(event.window.last)) fail(`${s.id}.outsideTournament ${event.id}: window outside the season window`);
      if (event.window.first > event.window.last) fail(`${s.id}.outsideTournament ${event.id}: window.first is after window.last`);
      for (const r of event.rounds) {
        if (r.date < event.window.first || r.date > event.window.last) fail(`${s.id}.outsideTournament ${event.id}: round ${r.label} outside the window`);
        if (!r.label.trim()) fail(`${s.id}.outsideTournament ${event.id}: a round needs a label`);
      }
      if (event.entrants.length < 2) fail(`${s.id}.outsideTournament ${event.id}: needs at least two entrants`);
      if (new Set(event.entrants).size !== event.entrants.length) fail(`${s.id}.outsideTournament ${event.id}: an entrant is listed twice`);
      if (!event.name.trim() || !event.note.trim() || !event.organizer.trim()) fail(`${s.id}.outsideTournament ${event.id}: needs a name, an organizer and a note`);
      if (s.holdsFieldHockeyChampionship) fail(`${s.id}: an outside tournament belongs to a section with no championship of its own`);
      for (const l of LEAGUES) {
        if (l.sectionId === s.id && l.postseason.kind !== 'no-postseason') {
          fail(`${s.id}.outsideTournament ${event.id}: ${l.id} has a postseason of its own, so its games cannot be read as the tournament's`);
        }
      }
      for (const src of event.sources) if (!src.href.startsWith('https://') || !src.label.trim()) fail(`${s.id}.outsideTournament ${event.id}: a source needs a label and an https URL`);
    }
    // The level-W/L → 'SO' rule is the section's: every league in it must decide level games the same way,
    // and a league that does must sit in a section that says how (lib/pipeline/normalize.ts keys on the section).
    for (const l of LEAGUES) {
      if (l.sectionId !== s.id) continue;
      if ((s.shootout !== null) !== (l.rules.leagueOvertime === 'shootout')) {
        fail(`${l.id}: leagueOvertime 'shootout' exactly when its section ${s.id} has a shootout rule`);
      }
    }
  }
  for (const id of regionIds) {
    if (!SECTIONS.some((s) => s.region === id)) fail(`region ${id} has no section`);
  }
  for (const l of LEAGUES) {
    if (!sectionIds.includes(l.sectionId)) fail(`${l.id}: unknown section ${l.sectionId}`);
    if ((RESERVED_SEGMENTS as readonly string[]).includes(l.id)) fail(`${l.id}: league id is a reserved route segment`);
    if (l.divisions.length === 0) fail(`${l.id}: no divisions`);
    for (const d of l.divisions) {
      if (d.leagueId !== l.id) fail(`${d.id}: leagueId ${d.leagueId} but listed under ${l.id}`);
    }
    if (divisionIds.includes(l.id) && !(l.divisions.length === 1 && l.divisions[0].id === l.id)) {
      fail(`${l.id}: a league id may equal only its own single division's id`);
    }
    if (l.membershipNote !== null && !l.membershipNote.trim()) fail(`${l.id}: membershipNote is empty (use null)`);
  }

  for (const l of LEAGUES) {
    const ps = l.postseason;
    const ownDivisions = l.divisions.map((d) => d.id);

    // 2. ladders cover 1..99 exactly once per division; statuses fit the postseason kind
    const allowed = allowedStatuses(ps.kind);
    for (const rung of ps.ladder) {
      if (!allowed.has(rung.status)) fail(`${l.id}: ladder status ${rung.status} not allowed for ${ps.kind}`);
      if (rung.divisions !== '*') {
        for (const id of rung.divisions) {
          if (!ownDivisions.includes(id)) fail(`${l.id}: ladder names division ${id} of another league`);
        }
      }
      const [a, b] = rung.places;
      if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= 99)) {
        fail(`${l.id}: bad ladder places [${a}, ${b}]`);
      }
      for (const key of ['label', 'phrase', 'badge', 'legend'] as const) {
        if (!rung[key]) fail(`${l.id}: ladder rung ${rung.status} has an empty ${key}`);
      }
    }
    // 2b. an unbracketed tournament: places 1..qualifiers are 'tournament', the rest 'below-line', no rung straddles
    if (ps.kind === 'unbracketed-tournament') {
      if (!(Number.isInteger(ps.qualifiers) && ps.qualifiers >= 1)) fail(`${l.id}: qualifiers ${ps.qualifiers} is not a positive integer`);
      for (const rung of ps.ladder) {
        const inside = rung.places[1] <= ps.qualifiers;
        if (inside !== (rung.status === 'tournament')) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] is ${rung.status}, but places 1-${ps.qualifiers} (and only they) are 'tournament'`);
        }
        if (rung.status === 'below-line' && !(rung.places[0] > ps.qualifiers)) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] straddles the ${ps.qualifiers} qualifiers`);
        }
      }
      if (!ps.name.trim()) fail(`${l.id}: an unbracketed tournament needs a name`);
      if (!ps.note.trim()) fail(`${l.id}: an unbracketed tournament needs a note`);
      for (const [key, text] of Object.entries(ps.citations)) {
        if (!text.trim()) fail(`${l.id}: empty postseason citation ${key}`);
      }
      if (!ps.sourceUrl.startsWith('https://')) fail(`${l.id}: postseason sourceUrl must start with https://`);
      if (ps.dates.first > ps.dates.last) fail(`${l.id}: postseason dates.first after dates.last`);
      for (const d of l.divisions) {
        if (!(ps.dates.first > d.leaguePlay.last)) fail(`${d.id}: postseason dates.first is not after leaguePlay.last`);
      }
      if (l.rules.postseasonFrom === null || !(l.rules.postseasonFrom <= ps.dates.first)) {
        fail(`${l.id}: an unbracketed tournament needs postseasonFrom on or before dates.first`);
      }
    }
    // 2c. no postseason: one sentence and its source; no postseason games, so no postseasonFrom and no line
    if (ps.kind === 'no-postseason') {
      if (!ps.note.trim()) fail(`${l.id}: a no-postseason league needs a note`);
      if (!ps.citations.noPlayoffs.trim()) fail(`${l.id}: empty postseason citation noPlayoffs`);
      if (!ps.sourceLabel.trim()) fail(`${l.id}: a no-postseason league needs a sourceLabel`);
      if (!ps.sourceUrl.startsWith('https://')) fail(`${l.id}: postseason sourceUrl must start with https://`);
      if (l.rules.postseasonFrom !== null) fail(`${l.id}: a no-postseason league has no postseasonFrom`);
      for (const d of l.divisions) {
        if (d.ladderLine !== null || d.home.lineAfter !== null) fail(`${d.id}: a no-postseason league draws no ladder or home line`);
      }
    }
    // 2d. section playoffs: only 1st has a league route ('tournament', the designated champion's play-in), every
    // other place is 'selection'; the field, the dates after league play, each member's playoff division
    if (ps.kind === 'section-playoffs') {
      for (const rung of ps.ladder) {
        const champion = rung.places[0] === 1 && rung.places[1] === 1;
        if ((rung.status === 'tournament') !== champion) {
          fail(`${l.id}: ladder rung [${rung.places[0]}, ${rung.places[1]}] is ${rung.status}, but only place 1 (and only it) is 'tournament'`);
        }
      }
      for (const [key, text] of [
        ['name', ps.name], ['note', ps.note], ['qualificationLine', ps.qualificationLine], ['sourceLabel', ps.sourceLabel],
      ] as const) {
        if (!text.trim()) fail(`${l.id}: section playoffs need a ${key}`);
      }
      for (const [key, text] of Object.entries(ps.citations)) {
        if (!text.trim()) fail(`${l.id}: empty postseason citation ${key}`);
      }
      for (const url of [ps.sourceUrl, ps.powerRankingsUrl]) {
        if (!url.startsWith('https://')) fail(`${l.id}: postseason sourceUrl and powerRankingsUrl must start with https://`);
      }
      if (ps.divisions.length === 0) fail(`${l.id}: section playoffs need their divisions`);
      for (const d of ps.divisions) {
        if (!d.name.trim() || !(Number.isInteger(d.teams) && d.teams >= 1)) fail(`${l.id}: bad playoff division ${d.name}`);
      }
      if (ps.dates.first > ps.dates.last) fail(`${l.id}: postseason dates.first after dates.last`);
      for (const d of l.divisions) {
        if (!(ps.dates.first > d.leaguePlay.last)) fail(`${d.id}: postseason dates.first is not after leaguePlay.last`);
      }
      if (l.rules.postseasonFrom === null || !(l.rules.postseasonFrom <= ps.dates.first)) {
        fail(`${l.id}: section playoffs need postseasonFrom on or before dates.first`);
      }
      // Shape only: lib/teams.ts asserts the keys are exactly the league's slugs (this module never reads the registry).
      const entries = Object.entries(ps.playoffDivisionOf);
      const total = l.divisions.reduce((n, d) => n + d.expectedTeams, 0);
      if (entries.length !== total) fail(`${l.id}: ${entries.length} playoff divisions for ${total} teams`);
      for (const [slug, div] of entries) {
        if (!SLUG_PATTERN.test(slug)) fail(`${l.id}: playoffDivisionOf key ${slug} is not a slug`);
        if (div !== 'I' && div !== 'II') fail(`${l.id}: playoffDivisionOf ${slug} is ${String(div)}, not I or II`);
      }
    }

    for (const div of ownDivisions) {
      const covered = new Array<number>(100).fill(0);
      for (const rung of ps.ladder) {
        if (rung.divisions !== '*' && !rung.divisions.includes(div)) continue;
        for (let p = rung.places[0]; p <= rung.places[1]; p++) covered[p] += 1;
      }
      for (let p = 1; p <= 99; p++) {
        if (covered[p] !== 1) fail(`${div}: ladder covers place ${p} ${covered[p]} times`);
      }
    }

    // 4. chains
    const rules = l.rules;
    const chains = chainsOf(l);
    const usedStages = new Set<TiebreakStage>();
    for (const { start, chain } of chains) {
      const where = start === null ? `${l.id} default chain` : `${l.id} chain for bucket start ${start}`;
      if (chain.length === 0) fail(`${where} is empty`);
      if (chain.includes('points')) fail(`${where} contains 'points'`);
      if (chain.includes('play-in')) fail(`${where} contains 'play-in'`);
      if (dupes(chain).length) fail(`${where} repeats a stage`);
      const uncomputable = chain.filter((s) => UNCOMPUTABLE.has(s));
      if (uncomputable.length > 1) fail(`${where} has more than one uncomputable stage`);
      if (uncomputable.length === 1 && chain[chain.length - 1] !== uncomputable[0]) {
        fail(`${where}: the uncomputable stage ${uncomputable[0]} is not last`);
      }
      if (chain.includes('draw-number') && chain[chain.length - 1] !== 'draw-number') {
        fail(`${where}: draw-number is not last`);
      }
      if (uncomputable.length === 1 && chain.includes('draw-number')) {
        fail(`${where}: draw-number and an uncomputable stage cannot both end it`);
      }
      // 11. place-relative stages only for buckets starting at 1st or 2nd
      for (const s of chain) {
        if (PLACE_VS_STAGES.has(s) && start !== 1 && start !== 2) {
          fail(`${where}: ${s} is allowed only in byBucketStart chains for 1 and 2`);
        }
      }
      for (const s of chain) usedStages.add(s);
    }
    for (const key of Object.keys(rules.tiebreaks.byBucketStart ?? {})) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1) fail(`${l.id}: byBucketStart key ${key} is not a place`);
    }
    for (const s of usedStages) {
      if (!rules.citations.stages[s]) fail(`${l.id}: stage ${s} has no citation`);
    }
    for (const key of ['points', 'pointsShort', 'order', 'doubleRoundRobin', 'overtime', 'coChampions'] as const) {
      if (!rules.citations[key]) fail(`${l.id}: empty citation ${key}`);
    }
    if (!rules.coChampionsLabel) fail(`${l.id}: empty coChampionsLabel`);
    if (ps.kind === 'league-tournament') {
      if (!rules.citations.stages['play-in']) fail(`${l.id}: a league tournament needs a 'play-in' citation`);
      if (!rules.unresolvedSuffix) fail(`${l.id}: a league tournament needs an unresolvedSuffix`);
    }
    if (rules.excludeContestTypes.includes(0)) fail(`${l.id}: excludeContestTypes may not contain 0 (the league flag)`);
    // 'shootout' is built only where no official fixtures decide what counts (none to match level games against):
    // MaxPreps' league flag (EAL) or division membership (the San Diego leagues).
    if (rules.leagueOvertime === 'shootout' && rules.classification === 'official-fixtures') {
      fail(`${l.id}: leagueOvertime 'shootout' needs classification 'contest-type' or 'membership'`);
    }

    // 5. draw numbers
    const usesDraw = usedStages.has('draw-number');
    if (usesDraw !== (rules.drawNumbers !== null)) {
      fail(`${l.id}: drawNumbers must be set exactly when a chain uses draw-number`);
    }
    if (rules.drawNumbers) {
      const values = Object.values(rules.drawNumbers);
      if (new Set(values).size !== values.length) fail(`${l.id}: draw numbers are not distinct`);
      const total = l.divisions.reduce((n, d) => n + d.expectedTeams, 0);
      if (values.length !== total) fail(`${l.id}: ${values.length} draw numbers for ${total} teams`);
    }

    // 6. pairings
    if (ps.kind === 'ccs-ladder') {
      for (const p of ps.pairings) {
        for (const seat of p.seats) {
          if (!ownDivisions.includes(seat.division)) fail(`${p.id}: seat division ${seat.division} is not in ${l.id}`);
          if (!Number.isInteger(seat.place) || seat.place < 1) fail(`${p.id}: seat place ${seat.place}`);
        }
      }
    }

    // 9. counts and dates
    const section = SECTION_BY_ID.get(l.sectionId);
    const inWindow = (date: string, what: string): void => {
      const day = date.slice(0, 10);
      if (!DATE_PATTERN.test(day)) fail(`${what}: "${date}" is not a date`);
      if (section && (day < section.seasonWindow.start || day > section.seasonWindow.end)) {
        fail(`${what}: ${day} is outside the ${section.id} season window`);
      }
    };
    for (const d of l.divisions) {
      // A double round robin, or (null) no fixed schedule at all: only where MaxPreps' flag alone says what counts.
      if (d.gamesPerTeam === null) {
        if (!((rules.classification === 'contest-type' || rules.classification === 'membership') && d.official.mode === 'none')) {
          fail(`${d.id}: gamesPerTeam null needs classification 'contest-type' or 'membership' and official mode 'none'`);
        }
      } else if (d.gamesPerTeam !== (d.expectedTeams - 1) * 2) fail(`${d.id}: gamesPerTeam ${d.gamesPerTeam}`);
      if (d.leaguePlay.first > d.leaguePlay.last) fail(`${d.id}: leaguePlay first after last`);
      if (rules.postseasonFrom !== null && !(d.leaguePlay.last < rules.postseasonFrom)) {
        fail(`${d.id}: leaguePlay.last is not before postseasonFrom`);
      }
      inWindow(d.leaguePlay.first, `${d.id} leaguePlay.first`);
      inWindow(d.leaguePlay.last, `${d.id} leaguePlay.last`);
      // 10. official sources: bundled ones name their file, URL and hash; 'none' only on a contest-type or a
      // membership league (so an official-fixtures league never has a 'none' division), and a membership league
      // only with 'none' (a league with fixtures classifies by them)
      if (d.official.mode === 'bundled' && !(d.official.bundledFile && d.official.revisionCheckUrl && d.official.bundledSha256)) {
        fail(`${d.id}: a bundled official source needs bundledFile, revisionCheckUrl and bundledSha256`);
      }
      if (d.official.mode === 'none') {
        if (rules.classification === 'official-fixtures') {
          fail(`${d.id}: official mode 'none' on an ${rules.classification} league (no fixtures to classify by)`);
        }
        if (!d.official.note.trim()) fail(`${d.id}: official mode 'none' needs a note`);
      } else if (rules.classification === 'membership') {
        fail(`${d.id}: classification 'membership' needs official mode 'none'`);
      }
      // 12. home mini table and ladder line
      if (d.home.miniRows > d.expectedTeams) fail(`${d.id}: home.miniRows > expectedTeams`);
      if (d.home.lineAfter !== null && !(d.home.lineAfter < d.home.miniRows)) {
        fail(`${d.id}: home.lineAfter must be < home.miniRows`);
      }
      if ((d.home.lineAfter === null) !== (d.home.lineLabel === null)) {
        fail(`${d.id}: home.lineAfter and home.lineLabel must both be set or both be null`);
      }
      if (d.ladderLine === null) {
        if (!((ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams) || ps.kind === 'no-postseason')) {
          fail(`${d.id}: ladderLine may be null only for an unbracketed tournament whose qualifiers >= expectedTeams, or a league with no postseason`);
        }
      } else if (!(d.ladderLine.after < d.expectedTeams)) {
        fail(`${d.id}: ladderLine.after must be < expectedTeams`);
      }
      // MaxPreps' table, or (maxprepsLeagueId null) the absence of one: then nothing names it, it has no rows,
      // and every member is one it omits (the equation below).
      if (d.maxprepsLeagueId === null) {
        if (d.maxprepsName !== null || d.maxprepsSlug !== null) fail(`${d.id}: maxprepsLeagueId null needs maxprepsName and maxprepsSlug null`);
        if (d.maxprepsTeamCount !== 0) fail(`${d.id}: maxprepsLeagueId null needs maxprepsTeamCount 0`);
      } else {
        if (!GUID_RE.test(d.maxprepsLeagueId)) fail(`${d.id}: maxprepsLeagueId ${d.maxprepsLeagueId} is not a GUID`);
        if (!d.maxprepsName || !d.maxprepsSlug) fail(`${d.id}: a MaxPreps table needs maxprepsName and maxprepsSlug`);
      }
      // 13. a group of independents: a table of its members' games against each other (membership) and nothing
      // else a league has — no league document, no MaxPreps table, no postseason, no line to draw (DESIGN §24.10).
      if (l.independents) {
        if (rules.classification !== 'membership') fail(`${d.id}: a group of independents needs classification 'membership'`);
        if (d.official.mode !== 'none') fail(`${d.id}: a group of independents needs official mode 'none'`);
        if (d.maxprepsLeagueId !== null) fail(`${d.id}: a group of independents needs maxprepsLeagueId null`);
        if (ps.kind !== 'no-postseason') fail(`${d.id}: a group of independents needs postseason kind 'no-postseason'`);
        if (d.reportedTrust !== 'informational') fail(`${d.id}: a group of independents needs reportedTrust 'informational'`);
        if (d.knownCause !== null) fail(`${d.id}: a group of independents needs knownCause null`);
        if (d.ladderLine !== null) fail(`${d.id}: a group of independents needs ladderLine null`);
        if (d.home.lineAfter !== null || d.home.lineLabel !== null) fail(`${d.id}: a group of independents needs no home line`);
        if (!l.standaloneName) fail(`${d.id}: a group of independents needs a standaloneName (its short name alone names no group)`);
      }
      // MaxPreps' table: its rows, plus the members it omits, less its known non-member rows, are the registry.
      for (const [id, reason] of Object.entries(d.maxprepsExtraRows)) {
        if (!GUID_RE.test(id)) fail(`${d.id}: maxprepsExtraRows key ${id} is not a GUID`);
        if (!reason.trim()) fail(`${d.id}: maxprepsExtraRows ${id} has no reason`);
      }
      const extra = Object.keys(d.maxprepsExtraRows).length;
      if (d.maxprepsTeamCount + d.maxprepsMissing.length - extra !== d.expectedTeams) {
        fail(`${d.id}: maxprepsTeamCount + maxprepsMissing − maxprepsExtraRows must equal expectedTeams`);
      }
    }
    if (rules.postseasonFrom !== null) inWindow(rules.postseasonFrom, `${l.id} postseasonFrom`);
    for (const k of l.keyDates) inWindow(k.date, `${l.id} keyDate ${k.id}`);
    for (const step of l.phases) {
      if (step.through !== 'data' && step.through !== 'league-play') inWindow(step.through, `${l.id} phase ${step.phase}`);
    }
    switch (ps.kind) {
      case 'ccs-ladder':
        for (const p of ps.pairings) {
          inWindow(p.date, `${p.id} date`);
          if (p.window) {
            inWindow(p.window.first, `${p.id} window.first`);
            inWindow(p.window.last, `${p.id} window.last`);
            if (p.window.first > p.window.last) fail(`${p.id}: window.first is after window.last`);
            if (p.date < p.window.first || p.date > p.window.last) fail(`${p.id}: date is outside its window`);
          }
        }
        break;
      case 'league-tournament':
        for (const r of ps.rounds) inWindow(r.date, `${l.id} round ${r.id}`);
        for (const [id, note] of Object.entries(ps.resultNotes)) {
          if (!GUID_RE.test(id)) fail(`${l.id} resultNotes key ${id} is not a contest GUID`);
          if (!note.trim() || !/\.$/.test(note.trim())) fail(`${l.id} resultNotes ${id}: a sourced sentence ending in a period`);
        }
        if (!ps.citations.pennant.trim()) fail(`${l.id}: citations.pennant names the title rule's source`);
        {
          const site = ps.finalSite;
          // The address is the site school's (data/schools.json); lib/teams.ts checks the slug is a member.
          if (!site.venue.trim()) fail(`${l.id}: finalSite needs a venue`);
          if ((site.admission === null) !== (site.admissionSource === null)) fail(`${l.id}: finalSite admission and admissionSource are set together or not at all`);
        }
        break;
      case 'unbracketed-tournament':
        if (ps.site !== null) {
          if (!ps.site.label.trim() || !ps.site.basis.trim()) fail(`${l.id}: postseason site needs a label and a basis`);
          if (!ps.site.url.startsWith('https://')) fail(`${l.id}: postseason site.url must start with https://`);
          if (ps.site.day < ps.dates.first || ps.site.day > ps.dates.last) fail(`${l.id}: postseason site.day is outside the event's dates`);
        }
        for (const s of ps.streams) if (!s.label.trim() || !s.href.startsWith('https://')) fail(`${l.id}: a stream needs a label and an https URL`);
        inWindow(ps.dates.first, `${l.id} postseason dates.first`);
        inWindow(ps.dates.last, `${l.id} postseason dates.last`);
        break;
      case 'section-playoffs':
        inWindow(ps.dates.first, `${l.id} postseason dates.first`);
        inWindow(ps.dates.last, `${l.id} postseason dates.last`);
        {
          const ids = new Set<string>();
          let last = '';
          for (const r of ps.rounds) {
            if (ids.has(r.id)) fail(`${l.id} round ${r.id} is listed twice`);
            ids.add(r.id);
            if (r.date < ps.dates.first || r.date > ps.dates.last) fail(`${l.id} round ${r.id} is outside the playoffs' dates`);
            if (r.date < last) fail(`${l.id} round ${r.id} is out of date order`);
            last = r.date;
            if (!r.label.trim()) fail(`${l.id} round ${r.id} needs a label`);
            if (r.time !== null && !/^\d{2}:\d{2}$/.test(r.time)) fail(`${l.id} round ${r.id}: time is a league clock 'HH:MM'`);
            if (r.id.startsWith('final') && !r.site) fail(`${l.id} round ${r.id}: a final names its site`);
          }
          for (const url of [ps.calendarUrl, ps.bracketsPageUrl, ...(ps.bracketSheetUrl ? [ps.bracketSheetUrl] : [])]) {
            if (!url.startsWith('https://')) fail(`${l.id}: a postseason URL must start with https:// (${url})`);
          }
        }
        break;
      case 'no-postseason':
        break;
    }
  }

  // 3. the CCS field
  const aqKeys = Object.keys(CCS.autoQualifiers).sort();
  const expectedKeys = [...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort();
  if (aqKeys.join() !== expectedKeys.join()) {
    fail(`CCS.autoQualifiers keys ${aqKeys.join(', ')} != ${expectedKeys.join(', ')}`);
  }
  let sum = CCS.autoQualifiers.atLarge;
  for (const l of LEAGUES) {
    if (l.postseason.kind !== 'ccs-ladder') continue;
    if (l.postseason.autoBerths !== CCS.autoQualifiers[l.id]) {
      fail(`${l.id}: autoBerths ${l.postseason.autoBerths} != CCS ${CCS.autoQualifiers[l.id]}`);
    }
    if (l.sectionId !== 'ccs') fail(`${l.id}: a CCS ladder league outside the CCS`);
    sum += l.postseason.autoBerths;
  }
  if (sum !== CCS.autoQualifiers.total) fail(`CCS field sums to ${sum}, not ${CCS.autoQualifiers.total}`);
  const ccs = SECTION_BY_ID.get('ccs');
  if (ccs) {
    for (const [k, v] of Object.entries(CCS.keyDates)) {
      const day = v.slice(0, 10);
      if (day < ccs.seasonWindow.start || day > ccs.seasonWindow.end) fail(`CCS.keyDates.${k} outside the CCS season window`);
    }
  }

  // 8. ignored MaxPreps leagues are never configured
  for (const id of Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)) {
    if (ALL_DIVISIONS.some((d) => d.maxprepsLeagueId === id)) fail(`ignored MaxPreps league ${id} is configured`);
  }
  // A date correction names its contest by GUID, a real date inside a season window, and its source; a
  // contest is never both corrected and excluded (the correction would be for nothing).
  for (const [id, o] of Object.entries(DATA_QUALITY.contestDateOverrides)) {
    if (!GUID_RE.test(id)) fail(`contestDateOverrides: ${id} is not a contest GUID`);
    const valid = DATE_PATTERN.test(o.dateKey) && !Number.isNaN(Date.parse(`${o.dateKey}T12:00:00Z`)) &&
      new Date(`${o.dateKey}T12:00:00Z`).toISOString().slice(0, 10) === o.dateKey;
    if (!valid) fail(`contestDateOverrides ${id}: dateKey ${o.dateKey} is not a valid YYYY-MM-DD date`);
    else if (!SECTIONS.some((s) => o.dateKey >= s.seasonWindow.start && o.dateKey <= s.seasonWindow.end)) {
      fail(`contestDateOverrides ${id}: ${o.dateKey} is outside every section's season window`);
    }
    if (o.timeTba !== true) fail(`contestDateOverrides ${id}: timeTba must be true (no source gives a time)`);
    if (!o.source.trim()) fail(`contestDateOverrides ${id}: needs a source`);
    if (id in DATA_QUALITY.excludedContestIds) fail(`contestDateOverrides ${id}: the contest is excluded`);
  }
  // A moved fixture names an official fixture (`division:date:away@home`), a real date inside its section's
  // season window and other than the official one, one of its two teams as host, and its source.
  for (const [id, m] of Object.entries(DATA_QUALITY.fixtureMoves)) {
    const parts = /^([a-z0-9-]+):(\d{4}-\d{2}-\d{2}):([a-z0-9-]+)@([a-z0-9-]+)$/.exec(id);
    const division = parts ? DIVISION_BY_ID.get(parts[1]) : undefined;
    if (!parts || !division) {
      fail(`fixtureMoves: ${id} is not an official fixture id of a configured division`);
      continue;
    }
    const valid = DATE_PATTERN.test(m.dateKey) && !Number.isNaN(Date.parse(`${m.dateKey}T12:00:00Z`)) &&
      new Date(`${m.dateKey}T12:00:00Z`).toISOString().slice(0, 10) === m.dateKey;
    if (!valid) fail(`fixtureMoves ${id}: dateKey ${m.dateKey} is not a valid YYYY-MM-DD date`);
    else {
      const window = SECTION_BY_ID.get(leagueOfDivision(division.id).sectionId)?.seasonWindow;
      if (window && (m.dateKey < window.start || m.dateKey > window.end)) fail(`fixtureMoves ${id}: ${m.dateKey} is outside its section's season window`);
    }
    if (m.dateKey === parts[2]) fail(`fixtureMoves ${id}: dateKey is the official date`);
    if (m.home !== parts[3] && m.home !== parts[4]) fail(`fixtureMoves ${id}: home ${m.home} is neither side of the fixture`);
    if (!m.source.trim()) fail(`fixtureMoves ${id}: needs a source`);
  }
}

assertLeagues();
