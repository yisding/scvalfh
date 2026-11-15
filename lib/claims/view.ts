/**
 * The view (§4.1, §4.2, risk R1): the ordered list of fixtures the run publishes, the decisions each stage took for
 * them, and the run-level facts resolve reads. The run (lib/pipeline/run.ts) publishes `games(stage)` after each
 * stage: every fixture of the order resolved through that stage (lib/claims/resolve.ts), in order.
 *
 * Several rules decide by list order (the official matcher takes the first game, the backfill's used set, the
 * sheet's first candidate), so the order is kept exactly as the legacy steps built their game list: a stage's new
 * fixtures are appended where those steps appended their games, and the order is re-sorted where, and how, they
 * sorted. It is never derived from the fixture ids.
 *
 * A stage's decisions about existing games are keyed by contest id, as its rule module takes them; `decide` hands
 * each to every fixture of the order whose game has that contest id. Each fixture's game is resolved stage by stage
 * and remembered, with applyStage, so resolving the next stage folds one more stage; a decision recorded for a stage
 * forgets what was resolved from that stage on.
 */

import { byDateThenId } from '../format';
import type { ContestId, Game } from '../types';
import type { EditorView } from './editor';
import { NO_DECISIONS, applyStage } from './resolve';
import type { ClaimStore } from './store';
import { STAGES, type Fixture, type FixtureDecisions, type FixtureId, type RunFacts, type Stage } from './types';

/** The decision fields a stage records by contest id. */
type ByContest = Omit<FixtureDecisions, 'from' | 'enters' | 'frozen'>;

const stageIndex = (stage: Stage): number => STAGES.indexOf(stage);

/** The stage each decision field belongs to: recording it forgets what was resolved from that stage on. */
const FIELD_STAGE: Record<Exclude<keyof FixtureDecisions, 'from' | 'enters'>, Stage> = {
  official: 'official',
  backfill: 'sblive',
  reconcile: 'sblive',
  vnn: 'vnn',
  sheet: 'sdsSheet',
  frozen: 'guards',
  cifss: 'results',
  box: 'results',
};

export class RunView {
  private order: FixtureId[] = [];
  private readonly decided = new Map<FixtureId, FixtureDecisions>();
  /** Each fixture's game by stage index, as far as it has been resolved; null: none at that stage. */
  private readonly resolved = new Map<FixtureId, (Game | null)[]>();
  private facts: RunFacts = { degradedDivisions: new Set() };

  constructor(
    private readonly store: ClaimStore,
    private readonly editor: EditorView,
  ) {}

  /** The fixtures the run publishes, in order. */
  ids(): readonly FixtureId[] {
    return this.order;
  }

  /** Every decision taken so far, by fixture (fixtures that left the order keep theirs). */
  decisions(): ReadonlyMap<FixtureId, FixtureDecisions> {
    return this.decided;
  }

  runFacts(): RunFacts {
    return this.facts;
  }

  /** Stage `maxpreps`: the order and decisions MATCH gave (lib/claims/sources/maxpreps.ts matchMaxpreps). */
  start(order: readonly FixtureId[], decisions: ReadonlyMap<FixtureId, FixtureDecisions>): void {
    this.order = [...order];
    this.decided.clear();
    this.resolved.clear();
    for (const [id, d] of decisions) this.decided.set(id, d);
  }

  /** The run-level facts classification reads (the official step's degraded divisions). */
  setFacts(facts: RunFacts): void {
    this.facts = facts;
    for (const id of this.resolved.keys()) this.forget(id, 'classify');
  }

  /** Every fixture of the order resolved through `through`, in order. */
  games(through: Stage): Game[] {
    return this.order.map((id) => {
      const g = this.gameAt(id, stageIndex(through));
      if (g === null) throw new Error(`lib/claims/view.ts: the view names ${id}, which publishes no game at stage ${through}`);
      return g;
    });
  }

  /**
   * A stage's decisions about games, by contest id (a map, or a function answering undefined for none), onto each
   * fixture of the order whose game (through the stage before, or the one it enters with at this stage) has that id.
   */
  decide<K extends keyof ByContest>(
    stage: Stage,
    key: K,
    byContest: ReadonlyMap<ContestId, NonNullable<ByContest[K]>> | ((contestId: ContestId) => ByContest[K] | undefined),
  ): void {
    const of = typeof byContest === 'function' ? byContest : (id: ContestId) => byContest.get(id);
    if (typeof byContest !== 'function' && byContest.size === 0) return;
    for (const id of this.order) {
      const value = of(this.contestOf(id, stage));
      if (value !== undefined) this.record(id, { [key]: value } as Partial<FixtureDecisions>);
    }
  }

  /**
   * Games that first appear at `stage` (si.com's rule-2 games, the sheet's games, the editor's listings), appended to
   * the order in the order given. Each goes to the fixture `fixtureOf` names, unless that one is already in the
   * order or has none, when it gets a passthrough fixture of its own.
   */
  enter(stage: Stage, games: readonly Game[], fixtureOf: (game: Game) => FixtureId | undefined): FixtureId[] {
    const ids: FixtureId[] = [];
    for (const game of games) {
      const named = fixtureOf(game);
      const id = named !== undefined && !this.order.includes(named) ? named : this.passthrough(game.contestId);
      this.decided.set(id, { from: stage, enters: game });
      this.resolved.delete(id);
      this.order.push(id);
      ids.push(id);
    }
    return ids;
  }

  /** The fixtures whose game through `through` matches `drop` leave the order; returns them with those games, in order. */
  remove(through: Stage, drop: (game: Game) => boolean): Array<{ id: FixtureId; game: Game }> {
    const games = this.games(through);
    const gone = this.order.map((id, i) => ({ id, game: games[i] })).filter(({ game }) => drop(game));
    const ids = new Set(gone.map(({ id }) => id));
    this.order = this.order.filter((id) => !ids.has(id));
    return gone;
  }

  /**
   * Stage `guards` (§7.8): a frozen league's games, `previous` (its previous snapshot's, classified), appended in
   * order, each on the fixture that left the order with the same contest id (`removed`), else on a passthrough.
   */
  freeze(removed: ReadonlyArray<{ id: FixtureId; game: Game }>, previous: readonly Game[]): void {
    const free = new Map<ContestId, FixtureId[]>();
    for (const { id, game } of removed) free.set(game.contestId, [...(free.get(game.contestId) ?? []), id]);
    for (const game of previous) {
      const reused = free.get(game.contestId)?.shift();
      const id = reused ?? this.passthrough(game.contestId);
      if (reused === undefined) this.decided.set(id, { from: 'guards' });
      this.record(id, { frozen: game });
      this.order.push(id);
    }
  }

  /** lib/format.ts byDateThenId over each fixture's game through `through` (normalize, frozen leagues, editor listings). */
  sortByDateThenId(through: Stage): void {
    this.sortBy(through, byDateThenId);
  }

  /** The bracket sheet's order (lib/postseason/sds-sheet-results.ts): dateKey, then contest id by localeCompare. */
  sortSheet(through: Stage): void {
    this.sortBy(through, (a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
  }

  private sortBy(through: Stage, compare: (a: Game, b: Game) => number): void {
    const games = this.games(through);
    this.order = this.order
      .map((id, i) => ({ id, g: games[i] }))
      .sort((a, b) => compare(a.g, b.g))
      .map(({ id }) => id);
  }

  /** The contest id a stage's decision for fixture `id` is keyed by: its game through the stage before, else the one it enters with. */
  private contestOf(id: FixtureId, stage: Stage): ContestId {
    const before = stageIndex(stage) > 0 ? this.gameAt(id, stageIndex(stage) - 1) : null;
    const game = before ?? this.decided.get(id)?.enters ?? this.gameAt(id, stageIndex(stage));
    if (!game) throw new Error(`lib/claims/view.ts: ${id} has no game at stage ${stage}`);
    return game.contestId;
  }

  private record(id: FixtureId, patch: Partial<FixtureDecisions>): void {
    this.decided.set(id, { ...(this.decided.get(id) ?? NO_DECISIONS), ...patch });
    for (const key of Object.keys(patch) as Array<keyof typeof FIELD_STAGE>) this.forget(id, FIELD_STAGE[key]);
  }

  /** Forget what fixture `id` resolved to from `stage` on. */
  private forget(id: FixtureId, stage: Stage): void {
    const memo = this.resolved.get(id);
    if (memo) memo.length = Math.min(memo.length, stageIndex(stage));
  }

  /** A fixture id for a game no fixture holds: never in the store, never written, unique in the run. */
  private passthrough(contestId: ContestId): FixtureId {
    const base = `passthrough:${contestId}`;
    let id = base;
    for (let n = 2; this.decided.has(id) || this.store.get(id) !== undefined; n += 1) id = `${base}~${n}`;
    return id;
  }

  /** Fixture `id`'s game through the stage at index `k`, resolved stage by stage from what is remembered. */
  private gameAt(id: FixtureId, k: number): Game | null {
    let memo = this.resolved.get(id);
    if (!memo) {
      memo = [];
      this.resolved.set(id, memo);
    }
    const f: Fixture = this.store.get(id) ?? { id, claims: {} };
    const d = this.decided.get(id) ?? NO_DECISIONS;
    const from = stageIndex(d.from);
    for (let i = memo.length; i <= k; i += 1) {
      memo.push(i < from ? null : applyStage(STAGES[i], i === 0 ? null : memo[i - 1], f, d, this.facts, this.editor));
    }
    return memo[k];
  }
}
