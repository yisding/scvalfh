/**
 * Claims seeded from a snapshot (§9): what a run reads when the claims file beside the previous snapshot is
 * missing, stale or for another sport, and what scripts/claims-seed.ts writes beside each committed snapshot.
 *
 * Input is the LOADED previous snapshot (lib/snapshot/snapshot-load.ts: migrated, and its results re-recorded
 * under the current ledger). Each MaxPreps game is taken back to the contest normalize built, undoing the later
 * steps in reverse pipeline order with the un-merge helpers that sit beside their writers. Where a step's input is
 * lost (§9's table), the seeded claim holds the merged value or a reconstruction and names the field in
 * `reconstructed`; every such field is one that resolve writes again while the fact that merged it stands, and the
 * next run that reads the team's feed replaces the claim with an exact one.
 *
 * The MaxPreps claims are seeded; then si.com's fills and disagreements as the games show them (§7.3, the same
 * write-back a run makes, lib/claims/sources/sblive.ts), each `sblive:` game on a fixture of its own; then the bracket
 * sheet's rows as its games show them (§7.6, lib/claims/sources/sds-sheet.ts), each `cifsds:` game on a fixture of
 * its own; then the league schedules' (§7.2, lib/claims/sources/official.ts): each stamp a game shows, with the
 * contest it was matched to, and each official fixture no game matched, on an official-only fixture; then the
 * evidence-only sources' claims on their games: a school calendar's venue name and confirmed start time (§7.4; the
 * venue name also stays on the MaxPreps claim, since which source wrote it is not stored), the cifsshome.org score a
 * game shows (§7.9) and its box score (§7.10). The editor's claims are rebuilt every run (lib/claims/editor.ts).
 */

import { datesAtLocal, localDateKey } from '../format';
import { fixtureKey } from '../fixtures/ledger';
import { GUID_RE } from '../game-id';
import { getSection } from '../leagues';
import { pacificMidnightUtc } from '../pipeline/normalize';
import { flagConflictSentence, isLevelWithWinner, unsettleLevelFinal } from '../postseason/level-final';
import { roundSiteOf } from '../postseason/round-site';
import { unswapHost } from '../results/host-correction';
import { overtimeDecider, unadjudicated, uncorrected, withoutReadTally } from '../results/result';
import { SPORT_ID } from '../sports/current';
import { resolveTeam } from '../teams';
import type { Game, GameSide, Outcome, Snapshot } from '../types';
import type { EditorView } from './editor';
import { baseFixtureId, fixtureSideKey } from './identity';
import { SDS_BRACKETS_FILE } from '../postseason/sds-brackets-file';
import { publishedFixture } from './published';
import { boxClaimOfScore } from './sources/box';
import { cifssClaimRef } from './sources/cifss';
import { writeBackSbliveClaims } from './sources/sblive';
import { writeBackOfficialClaims } from './sources/official';
import { writeBackSheetClaims } from './sources/sds-sheet';
import { vnnClaimsOf } from './sources/vnn';
import { ClaimStore } from './store';
import {
  MAXPREPS_PROVENANCE_KEYS,
  RECONSTRUCTED_FIELDS,
  type ClaimsFile,
  type FixtureId,
  type MaxprepsClaim,
  type MaxprepsGame,
  type MaxprepsProvenance,
  type Reconstructed,
} from './types';

const outcomeOf = (own: number, other: number): Outcome => (own > other ? 'W' : own < other ? 'L' : 'T');

/**
 * Whether normalize itself gives this game decider 'SO' for a level score marked W and L: both sides teams of one
 * section whose shootout rule reaches the game (lib/pipeline/normalize.ts toGame's `shootoutSection`). A stored
 * 'SO' on such a game is normalize's, not the classify step's settled final.
 */
function normalizeReadsShootout(g: Game): boolean {
  if (g.isForfeit) return false;
  const home = resolveTeam(g.home.teamId);
  const away = resolveTeam(g.away.teamId);
  if (!home || !away || home.section !== away.section) return false;
  const section = getSection(home.section);
  if (section.shootout === null) return false;
  const tournamentRow = g.contestTypes.home === 2 || g.contestTypes.away === 2;
  return !(tournamentRow && section.shootout.coversTournaments === false);
}

/** No score, no flags, no ending: how normalize builds a contest it has no final for. */
function unscored(g: Game, status: Game['status']): Game {
  return {
    ...g,
    status,
    home: { ...g.home, score: null, result: null },
    away: { ...g.away, score: null, result: null },
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
  };
}

/** `side` flagged by its own score against `other`. */
function flaggedBy(side: GameSide, own: number, other: number): GameSide {
  return { ...side, score: own, result: outcomeOf(own, other) };
}

/** The flag sentence at the head of a result conflict, in the orientation of `g`'s sides, once. */
function withFlagSentenceFirst(g: Game): Game {
  const mine = flagConflictSentence(g.home, g.away);
  const flipped = flagConflictSentence(g.away, g.home);
  const rest = (g.provenance.resultConflict ?? '').replace(mine, '').replace(flipped, '').trim();
  return { ...g, provenance: { ...g.provenance, resultConflict: rest ? `${mine} ${rest}` : mine } };
}

/** The MaxPreps claim's game: the keys toGame writes, and only its provenance keys. */
function projected(g: Game): MaxprepsGame {
  const {
    slug: _slug, aliases: _aliases, official: _official, result: _result, timeConfirmed: _confirmed,
    provenance, urls, countsFor: _counts, postseason: _post, ...rest
  } = g;
  void [_slug, _aliases, _official, _result, _confirmed, _counts, _post];
  const kept: Partial<MaxprepsProvenance> = {};
  for (const key of MAXPREPS_PROVENANCE_KEYS) {
    const v = provenance[key];
    if (v !== undefined) (kept as Record<string, unknown>)[key] = v;
  }
  // The official step's note shares the key; only normalize's own sentence is the contest's (normalize.ts toGame).
  if (kept.leagueFlagConflict !== undefined && !kept.leagueFlagConflict.startsWith('contestType disagrees')) delete kept.leagueFlagConflict;
  return {
    ...rest,
    countsFor: null,
    postseason: null,
    urls: { maxpreps: urls.maxpreps, nfhsStream: urls.nfhsStream, goFan: urls.goFan },
    provenance: kept as MaxprepsProvenance,
  };
}

/**
 * The MaxPreps claim of a stored GUID game (§9's MaxPreps rows, in that order): the contest as normalize built it,
 * before any ledger fact, as far as the stored game allows. `snapshotFetchedAt` is the stored snapshot's stamp.
 */
export function maxprepsClaimFromGame(stored: Game, snapshotFetchedAt: string): MaxprepsClaim {
  const lost = new Set<Reconstructed>();
  let g = stored;

  // 11c results, undone from the last step back.
  g = withoutReadTally(g);
  const roundSite = roundSiteOf(g);
  if (roundSite !== null && g.site === 'neutral' && g.venue.text === roundSite) {
    // withRoundSite replaced the site and the venue; MaxPreps' own are gone.
    lost.add('site');
    lost.add('venue');
  }
  const p0 = g.provenance;
  const sheetScore = p0.scores === 'cifsds-sheet';
  const settled = !p0.resultCorrection && !p0.backfill && !sheetScore && !normalizeReadsShootout(g) ? unsettleLevelFinal(g) : g;
  const wasSettled = settled !== g;
  g = settled;
  if (g.provenance.overtimeEvidence === 'box-score') {
    const { overtimeEvidence: _box, ...provenance } = g.provenance;
    void _box;
    g = { ...g, otPeriods: 0, isOt: false, decider: g.decider === 'OT' ? 'REG' : g.decider, provenance };
  }
  g = unadjudicated(g);
  if (g.provenance.resultCorrection) {
    g = uncorrected(g, g.provenance.resultCorrection);
    for (const f of ['flags', 'decider', 'forfeit', 'shootout', 'resultConflict'] as const) lost.add(f);
  }
  if (g.provenance.reportedWinner) {
    const { reportedWinner: _cite, ...provenance } = g.provenance;
    void _cite;
    const noScore = g.home.score === null && g.away.score === null;
    g = noScore
      ? { ...g, home: { ...g.home, result: null }, away: { ...g.away, result: null }, provenance }
      : { ...g, provenance };
  }

  // 09c the San Diego bracket sheet.
  if (g.provenance.sectionSheet?.rule === 'score-pending') {
    const { sectionSheet: _sheet, ...provenance } = g.provenance;
    void _sheet;
    const { cifsds: _url, ...urls } = g.urls;
    void _url;
    // MaxPreps' status (scheduled, live, score pending) is lost; the stored provenance.fetchedAt is the sheet's run.
    const status = g.dateKey < localDateKey(snapshotFetchedAt) ? 'score-pending' : 'scheduled';
    g = { ...unscored(g, status), urls, provenance: { ...provenance, scores: 'maxpreps-api' } };
    lost.add('status');
    lost.add('seenAt');
  }
  if (g.provenance.schedule === 'cifsds-sheet') {
    const { cifsds: _url, ...urls } = g.urls;
    void _url;
    g = {
      ...g,
      dateLocal: `${g.dateKey}T00:00:00`,
      dateUtc: pacificMidnightUtc(g.dateKey),
      isTimeTba: true,
      urls,
      provenance: { ...g.provenance, schedule: 'maxpreps-api' },
    };
  }

  // 08 si.com's fills (D2 rules 3 and 4).
  const backfill = g.provenance.backfill;
  if (backfill && backfill.rule !== 'absent-fixture') {
    const { backfill: _fill, scoreConflict: _conflict, ...rest } = g.provenance;
    void [_fill, _conflict];
    const provenance = { ...rest, scores: 'maxpreps-api' as const };
    const { sblive: _sblive, ...urls } = g.urls;
    void _sblive;
    const mp = backfill.maxpreps;
    if (backfill.rule === 'score-pending' || mp === null) {
      g = { ...unscored(g, 'score-pending'), urls, provenance };
    } else {
      g = { ...g, home: flaggedBy(g.home, mp.home, mp.away), away: flaggedBy(g.away, mp.away, mp.home), urls, provenance };
      lost.add('flags');
      lost.add('decider');
    }
  }

  // 06 the ledger's host and day.
  const hostCorrected = g.provenance.hostCorrection !== undefined;
  g = unswapHost(g);
  if (wasSettled && hostCorrected && isLevelWithWinner(g.home, g.away)) g = withFlagSentenceFirst(g);
  const moved = g.provenance.dateCorrection;
  if (moved) {
    const { dateCorrection: _moved, ...provenance } = g.provenance;
    void _moved;
    const dateLocal = moved.maxprepsDateLocal;
    const dateKey = dateLocal.slice(0, 10);
    const dateUtc = moved.maxprepsTimeTba ? pacificMidnightUtc(dateKey) : datesAtLocal(dateKey, dateLocal.slice(11, 16)).dateUtc;
    g = { ...g, dateLocal, dateKey, dateUtc, isDateTba: false, isTimeTba: moved.maxprepsTimeTba, provenance };
    lost.add('dateUtc');
    lost.add('isDateTba');
  }
  // MaxPreps' `Location:` note and a school calendar both write venue.name; which one did is not stored.
  if (g.venue.name !== undefined) lost.add('venue');
  // A decider the steps above left on a game normalize had no final for.
  if (g.status !== 'final' && g.decider !== null) g = { ...g, decider: null };
  if (g.status === 'final' && g.decider === null) g = { ...g, decider: g.isForfeit ? 'FORFEIT' : overtimeDecider(g.otPeriods) };

  const game = projected(g);
  const seenAt = g.provenance.fetchedAt;
  const reconstructed = RECONSTRUCTED_FIELDS.filter((f) => lost.has(f));
  return { ref: game.contestId, seenAt, game, ...(reconstructed.length > 0 ? { reconstructed } : {}) };
}

/** Where a new MaxPreps claim goes: the editor's fixture name when the ledger links the contest, else its own day and sides (§6.2). */
export function maxprepsBaseId(claim: MaxprepsClaim, editor: Pick<EditorView, 'byContest'>): FixtureId {
  const linked = editor.byContest.get(claim.ref);
  if (linked) return fixtureKey(linked);
  const g = claim.game;
  return baseFixtureId(g.dateKey, fixtureSideKey(g.away), fixtureSideKey(g.home));
}

/** Claims in the order ids are minted in (§6.2): by day, then by ref. */
export function byDateKeyThenRef(a: MaxprepsClaim, b: MaxprepsClaim): number {
  if (a.game.dateKey !== b.game.dateKey) return a.game.dateKey < b.game.dateKey ? -1 : 1;
  return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
}

/**
 * The claims a previous snapshot implies (§9), stamped with its fetchedAt; null with no previous snapshot. Every
 * MaxPreps (GUID) game of the snapshot gets a claim on a fixture of its own.
 */
export function claimsFromSnapshot(previous: Snapshot | null, editor: EditorView): ClaimsFile | null {
  if (!previous) return null;
  const claims = previous.games.filter((g) => GUID_RE.test(g.contestId)).map((g) => maxprepsClaimFromGame(g, previous.fetchedAt));
  const store = new ClaimStore();
  store.mergeRead('maxpreps', () => false, [...claims].sort(byDateKeyThenRef), (c) => store.create(maxprepsBaseId(c, editor)));
  // si.com's values and the sheet's rows as the games show them, then the evidence-only sources' claims on the fixtures of their games.
  writeBackSbliveClaims(store, previous.games, { rows: new Map(), sblive: false }, previous.fetchedAt);
  writeBackSheetClaims(store, previous.games, SDS_BRACKETS_FILE, () => false, previous.fetchedAt);
  writeBackOfficialClaims(store, previous.games, previous.officialFixtures ?? [], { rows: [], divisions: new Set() }, previous.fetchedAt);
  const cifssAt = previous.cifssCrossCheck?.cifssFetchedAt ?? previous.fetchedAt;
  for (const g of previous.games) {
    // An editor's listing gets the fixture its fixtureKey names, which the run's editor claim then joins.
    const id = publishedFixture(store, g);
    for (const c of vnnClaimsOf(g, () => previous.fetchedAt)) store.attach(id, 'vnn', c);
    const cifss = g.provenance.cifssScore;
    if (cifss) {
      const conflict = { contestId: g.contestId, cifss: { home: cifss.home, away: cifss.away }, cifssUrl: cifss.url };
      store.attach(id, 'cifss', { ref: cifssClaimRef(g.contestId), seenAt: cifssAt, conflict });
    }
    const box = boxClaimOfScore(g, previous.fetchedAt);
    if (box) store.attach(id, 'box', box);
  }
  return store.toFile(previous.fetchedAt, SPORT_ID);
}
