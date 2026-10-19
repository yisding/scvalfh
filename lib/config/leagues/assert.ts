/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, DESIGN-socal §2.1).
 * This file: checkLeagueConfig, the invariants over the whole configuration (SPEC §2.4). The door
 * calls it as assertLeagues() at module load with the objects it exports; it imports the parts it needs, never
 * the door. A violation throws a ConfigInvariantError `lib/config/leagues.ts: <message>`.
 *
 * Its runtime imports are leaves and parts: lib/config/invariant.ts (the typed invariant failure),
 * lib/model/league-config.ts (the config's shapes, for its SHOOTOUT_INFERENCES table),
 * lib/config/reserved-segments.ts (the reserved route segments), lib/shared/patterns.ts (the date-key
 * and slug RegExps) and ./tiebreak-stages.ts.
 */

import { failInvariant } from '@/lib/config/invariant';
import { RESERVED_SEGMENTS } from '@/lib/config/reserved-segments';
import type { LeagueId } from '@/lib/model/ids';
import type {
  CcsConfig, DataQualityConfig, LeagueConfig, PostseasonConfig, RegionConfig, SectionConfig,
} from '@/lib/model/league-config';
import { SHOOTOUT_INFERENCES } from '@/lib/model/league-config';
import type { PlayoffStatus, TiebreakStage } from '@/lib/model/standings';
import { GUID_RE } from '@/lib/shared/contest-id';
import { DATE_PATTERN, SLUG_PATTERN } from '@/lib/shared/patterns';

import { PLACE_VS_STAGES, UNCOMPUTABLE_STAGES, tiebreakChains } from './tiebreak-stages';

const CCS_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'aq', 'play-in', 'at-large', 'out', 'no-aq-route',
]);
const TOURNAMENT_LADDER_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>([
  'bye', 'tournament', 'below-line',
]);
const UNBRACKETED_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'below-line']);
const NO_POSTSEASON_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['no-postseason']);
const SECTION_PLAYOFFS_STATUSES: ReadonlySet<PlayoffStatus> = new Set<PlayoffStatus>(['tournament', 'selection']);

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

/** The whole configuration, as the door exports it (the same objects, so a test's mutation is seen here). */
export interface LeagueConfigParts {
  leagues: readonly LeagueConfig[];
  regions: readonly RegionConfig[];
  sections: readonly SectionConfig[];
  ccs: CcsConfig;
  dataQuality: DataQualityConfig;
}

/** Throws `lib/config/leagues.ts: <message>` on the first violated invariant (the door's assertLeagues). */
export function checkLeagueConfig({ leagues, regions, sections, ccs, dataQuality }: LeagueConfigParts): void {
  const fail = (m: string): never => failInvariant('lib/config/leagues.ts', m);
  // The door's derived lists, rebuilt from the parts it passes (config order, as there).
  const allDivisions = leagues.flatMap((l) => l.divisions);
  const ccsLeagueIds: readonly LeagueId[] = leagues.filter((l) => l.postseason.kind === 'ccs-ladder').map((l) => l.id);
  const sectionById = new Map<string, SectionConfig>(sections.map((s) => [s.id, s]));
  const dupes = (values: readonly string[]): string[] => [
    ...new Set(values.filter((v, i) => values.indexOf(v) !== i)),
  ];

  // 1. ids
  const regionIds = regions.map((r) => r.id as string);
  const sectionIds = sections.map((s) => s.id as string);
  const leagueIds = leagues.map((l) => l.id);
  const divisionIds = allDivisions.map((d) => d.id);
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
  const shortDupes = dupes(sections.map((s) => s.shortName as string));
  if (shortDupes.length) fail(`duplicate section shortName: ${shortDupes.join(', ')}`);
  // 1b. sections: a known region each, every region used, a rules source, a well-formed shootout rule
  for (const s of sections as readonly SectionConfig[]) {
    if (!regionIds.includes(s.region)) fail(`${s.id}: unknown region ${s.region}`);
    if (!s.rulesSource.name.trim()) fail(`${s.id}: rulesSource needs a name`);
    if (!s.rulesSource.url.startsWith('https://')) fail(`${s.id}: rulesSource.url must start with https://`);
    if (s.shootout !== null && !(s.shootout.words.trim() && s.shootout.citation.trim())) {
      fail(`${s.id}: shootout needs words and a citation (use null for none)`);
    }
    // What copy may say about a level W/L final turns on the inference (lib/format/score.ts shootoutPhrases), so
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
    // The level-W/L → 'SO' rule is the section's: every league in it must decide level games the same way,
    // and a league that does must sit in a section that says how (lib/pipeline/reconcile/normalize.ts keys on the section).
    for (const l of leagues) {
      if (l.sectionId !== s.id) continue;
      if ((s.shootout !== null) !== (l.rules.leagueOvertime === 'shootout')) {
        fail(`${l.id}: leagueOvertime 'shootout' exactly when its section ${s.id} has a shootout rule`);
      }
    }
  }
  for (const id of regionIds) {
    if (!sections.some((s) => s.region === id)) fail(`region ${id} has no section`);
  }
  for (const l of leagues) {
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

  for (const l of leagues) {
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
      // Shape only: lib/registry/teams.ts asserts the keys are exactly the league's slugs (this module never reads the registry).
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
    const chains = tiebreakChains(l);
    const usedStages = new Set<TiebreakStage>();
    for (const { start, chain } of chains) {
      const where = start === null ? `${l.id} default chain` : `${l.id} chain for bucket start ${start}`;
      if (chain.length === 0) fail(`${where} is empty`);
      if (chain.includes('points')) fail(`${where} contains 'points'`);
      if (chain.includes('play-in')) fail(`${where} contains 'play-in'`);
      if (dupes(chain).length) fail(`${where} repeats a stage`);
      const uncomputable = chain.filter((s) => UNCOMPUTABLE_STAGES.has(s));
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
    const section = sectionById.get(l.sectionId);
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
        for (const p of ps.pairings) inWindow(p.date, `${p.id} date`);
        break;
      case 'league-tournament':
        for (const r of ps.rounds) inWindow(r.date, `${l.id} round ${r.id}`);
        break;
      case 'unbracketed-tournament':
      case 'section-playoffs':
        inWindow(ps.dates.first, `${l.id} postseason dates.first`);
        inWindow(ps.dates.last, `${l.id} postseason dates.last`);
        break;
      case 'no-postseason':
        break;
    }
  }

  // 3. the CCS field
  const aqKeys = Object.keys(ccs.autoQualifiers).sort();
  const expectedKeys = [...ccsLeagueIds, 'atLarge', 'total'].sort();
  if (aqKeys.join() !== expectedKeys.join()) {
    fail(`CCS.autoQualifiers keys ${aqKeys.join(', ')} != ${expectedKeys.join(', ')}`);
  }
  let sum = ccs.autoQualifiers.atLarge;
  for (const l of leagues) {
    if (l.postseason.kind !== 'ccs-ladder') continue;
    if (l.postseason.autoBerths !== ccs.autoQualifiers[l.id]) {
      fail(`${l.id}: autoBerths ${l.postseason.autoBerths} != CCS ${ccs.autoQualifiers[l.id]}`);
    }
    if (l.sectionId !== 'ccs') fail(`${l.id}: a CCS ladder league outside the CCS`);
    sum += l.postseason.autoBerths;
  }
  if (sum !== ccs.autoQualifiers.total) fail(`CCS field sums to ${sum}, not ${ccs.autoQualifiers.total}`);
  const ccsSection = sectionById.get('ccs');
  if (ccsSection) {
    for (const [k, v] of Object.entries(ccs.keyDates)) {
      const day = v.slice(0, 10);
      if (day < ccsSection.seasonWindow.start || day > ccsSection.seasonWindow.end) fail(`CCS.keyDates.${k} outside the CCS season window`);
    }
  }

  // 8. ignored MaxPreps leagues are never configured
  for (const id of Object.keys(dataQuality.ignoredMaxprepsLeagueIds)) {
    if (allDivisions.some((d) => d.maxprepsLeagueId === id)) fail(`ignored MaxPreps league ${id} is configured`);
  }
  // A date correction names its contest by GUID, a real date inside a season window, and its source; a
  // contest is never both corrected and excluded (the correction would be for nothing).
  for (const [id, o] of Object.entries(dataQuality.contestDateOverrides)) {
    if (!GUID_RE.test(id)) fail(`contestDateOverrides: ${id} is not a contest GUID`);
    // Not isCalendarDate (lib/shared/patterns.ts): that one builds the day with Date.UTC, which reads the years 0000-0099
    // as 1900-1999 and so refuses them, where this ISO round trip accepts them (and then fails the season-window check
    // below under its own message). The two agree on every year a season window can hold, but not on every string.
    const valid = DATE_PATTERN.test(o.dateKey) && !Number.isNaN(Date.parse(`${o.dateKey}T12:00:00Z`)) &&
      new Date(`${o.dateKey}T12:00:00Z`).toISOString().slice(0, 10) === o.dateKey;
    if (!valid) fail(`contestDateOverrides ${id}: dateKey ${o.dateKey} is not a valid YYYY-MM-DD date`);
    else if (!sections.some((s) => o.dateKey >= s.seasonWindow.start && o.dateKey <= s.seasonWindow.end)) {
      fail(`contestDateOverrides ${id}: ${o.dateKey} is outside every section's season window`);
    }
    if (o.timeTba !== true) fail(`contestDateOverrides ${id}: timeTba must be true (no source gives a time)`);
    if (!o.source.trim()) fail(`contestDateOverrides ${id}: needs a source`);
    if (id in dataQuality.excludedContestIds) fail(`contestDateOverrides ${id}: the contest is excluded`);
  }
}
