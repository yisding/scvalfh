/**
 * The /game/[id] view model and route params (SPEC §10.6, §8.1, §8.4):
 * `components/game/game-model.ts`, `components/game/*`, `components/ui/ScoreBoard.tsx`,
 * `app/game/[id]/page.tsx` and `app/game/[id]/opengraph-image.tsx`.
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6; it holds
 * two si.com-only PCAL games and one si.com score on a score-pending MaxPreps contest). The MCAL
 * postseason note and the superseded-stub pages do not occur in the corpus, so one block runs on a
 * copy of it with one MCAL one-goal final tagged as a tournament game and one `supersededGames`
 * entry. Every assertion message names the module that produced the value.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game, Snapshot } from '../../lib/types';
import { corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Model = typeof import('../../components/game/game-model');
type GameIds = typeof import('../../lib/game-id');

interface Loaded {
  d: Data;
  m: Model;
  ids: GameIds;
  pageParams: () => Array<{ id: string }>;
  ogParams: () => Array<{ id: string }>;
  renderPage: (id: string) => Promise<string>;
  metadata: (id: string) => Promise<import('next').Metadata>;
}

const priorEnv = process.env.SCVAL_SNAPSHOT;
let corpusPath: string;
let L: Loaded;

async function loadModules(): Promise<Loaded> {
  vi.resetModules();
  const d = await import('../../lib/data');
  const m = await import('../../components/game/game-model');
  const ids = await import('../../lib/game-id');
  const page = await import('../../app/game/[id]/page');
  const og = await import('../../app/game/[id]/opengraph-image');
  return {
    d,
    m,
    ids,
    pageParams: page.generateStaticParams,
    ogParams: og.generateStaticParams,
    renderPage: async (id) => {
      const el = await page.default({ params: Promise.resolve({ id }) } as never);
      return renderToStaticMarkup(el as ReactElement);
    },
    metadata: (id) => page.generateMetadata({ params: Promise.resolve({ id }) } as never),
  };
}

beforeAll(async () => {
  corpusPath = corpusSnapshotPath('all-2026-10-02');
  process.env.SCVAL_SNAPSHOT = corpusPath;
  L = await loadModules();
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

const leagueOfSlug = (slug: string | null) => (slug ? L.d.getTeamBySlug(slug)?.league : undefined);

function counted(league: string, status: Game['status'] = 'final'): Game {
  const game = L.d
    .getGames({ leagueOnly: true, status })
    .find((g) => leagueOfSlug(g.home.slug) === league && !g.contestId.startsWith('sblive:'));
  if (!game) throw new Error(`tests: no counted ${league} ${status} game in the corpus`);
  return game;
}

describe('params (app/game/[id]/page.tsx and opengraph-image.tsx via game-model.ts gameStaticParams)', () => {
  it('page params === OG params, one per game, gameIdToParam round trip, no ":"', () => {
    const page = L.pageParams();
    const og = L.ogParams();
    expect(og, 'app/game/[id]/opengraph-image.tsx: OG params === page params').toEqual(page);
    const games = L.d.getGames();
    const superseded = Object.keys(L.d.getSupersededGames());
    expect(page.length, 'components/game/game-model.ts gameStaticParams count').toBe(games.length + superseded.length);
    for (const { id } of page) {
      expect(id, 'components/game/game-model.ts param').not.toContain(':');
      const contestId = L.ids.paramToGameId(id);
      expect(L.ids.gameIdToParam(contestId), `lib/game-id.ts round trip ${id}`).toBe(id);
      expect(
        !!L.d.getGameById(contestId) || superseded.includes(contestId),
        `components/game/game-model.ts ${id} resolves`,
      ).toBe(true);
    }
    const sblive = games.filter((g) => g.contestId.startsWith('sblive:'));
    expect(sblive.length, 'lib/data.ts: the corpus has si.com-only games').toBeGreaterThan(0);
    for (const g of sblive) {
      expect(page.map((p) => p.id), `components/game/game-model.ts ${g.contestId}`).toContain(g.contestId.replace(':', '-'));
    }
  });

  it('buildGameModel takes the URL param and returns undefined for an unknown id', () => {
    const g = L.d.getGames().find((x) => x.contestId.startsWith('sblive:'))!;
    const model = L.m.buildGameModel(L.ids.gameIdToParam(g.contestId));
    expect(model?.game.contestId, 'components/game/game-model.ts sblive param').toBe(g.contestId);
    expect(model?.canonical, 'components/game/game-model.ts canonical').toBe(L.ids.gameHref(g.contestId));
    expect(L.m.buildGameModel('nope'), 'components/game/game-model.ts unknown').toBeUndefined();
    expect(L.m.buildGameModel('sblive-1'), 'components/game/game-model.ts unknown sblive').toBeUndefined();
    expect(L.m.buildSupersededStub('sblive-1'), 'components/game/game-model.ts unknown stub').toBeUndefined();
    // The superseded map is a plain JSON object: no prototype member is ever a "target".
    for (const param of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(L.m.buildSupersededStub(param), `components/game/game-model.ts stub for "${param}"`).toBeUndefined();
    }
  });
});

describe('sub-lines, kicker and context (components/game/game-model.ts)', () => {
  it('sub-line is "<record> <division heading ?? league short>"', () => {
    const cases: Array<[string, RegExp]> = [
      ['scval', /^\d+-\d+-\d+ (De Anza|El Camino)$/],
      ['bval', /^\d+-\d+-\d+ (Mt\. Hamilton|Santa Teresa)$/],
      ['pcal', /^\d+-\d+-\d+ PCAL$/],
      ['mcal', /^\d+-\d+-\d+ MCAL$/],
    ];
    for (const [league, re] of cases) {
      const model = L.m.buildGameModel(counted(league).contestId)!;
      expect(model.home.sub, `components/game/game-model.ts ${league} home sub`).toMatch(re);
      expect(model.away.sub, `components/game/game-model.ts ${league} away sub`).toMatch(re);
    }
  });

  it('the kicker names the league (BVAL · Santa Teresa, MCAL, Non-league)', () => {
    const bval = L.m.buildGameModel(counted('bval').contestId)!;
    expect(L.m.gameKicker(bval), 'components/game/game-model.ts BVAL kicker').toMatch(
      /^FINAL( · \S+)? · BVAL · (Mt\. Hamilton|Santa Teresa)$/,
    );
    const mcal = L.m.buildGameModel(counted('mcal').contestId)!;
    expect(mcal.contextLabel, 'components/game/game-model.ts MCAL context').toBe('MCAL');
    expect(mcal.countsAs.label, 'components/game/game-model.ts MCAL counts as').toBe('League game · MCAL');
    expect(mcal.countsAs.detail, 'components/game/game-model.ts MCAL points').toBe(
      'Counts toward the MCAL standings — MCAL Field Hockey Handbook (rev. 10/19/24) §7a (3 points for a win, 1 for a tie).',
    );
    const scval = L.m.buildGameModel(counted('scval').contestId)!;
    expect(scval.countsAs.label, 'components/game/game-model.ts SCVAL counts as').toMatch(/^League game · (De Anza|El Camino) Division$/);
    const nonLeague = L.d.getGames().find((g) => g.countsFor === null && g.postseason === null)!;
    const nl = L.m.buildGameModel(nonLeague.contestId)!;
    expect(nl.contextLabel, 'components/game/game-model.ts non-league').toBe('Non-league');
    expect(L.m.gameKicker(nl).endsWith(' · Non-league'), 'components/game/game-model.ts non-league kicker').toBe(true);
  });

  it('the meta description names the league; the head-to-head note cites its own league', () => {
    const mcal = L.m.buildGameModel(counted('mcal').contestId)!;
    expect(L.m.gameDescription(mcal), 'components/game/game-model.ts MCAL description').toContain(
      'in Marin County Athletic League girls varsity field hockey, Fall 2026',
    );
    expect(mcal.series.tiebreakNote, 'components/game/game-model.ts MCAL h2h').toContain('MCAL Tie-Breaking Criteria (rev. 3/26) step 1');
    const scval = L.m.buildGameModel(counted('scval').contestId)!;
    expect(scval.series.tiebreakNote, 'components/game/game-model.ts SCVAL h2h').toContain('Article VI §3');
    expect(L.m.gameDescription(scval), 'components/game/game-model.ts SCVAL description').toContain(
      'in Santa Clara Valley Athletic League girls varsity field hockey, Fall 2026',
    );
  });
});

describe('si.com source line and the conflict block (components/game/GameSources.tsx, ScoreBoard.tsx)', () => {
  it('a si.com-only game: the source line, the † mark, the description', async () => {
    const g = L.d.getGames().find((x) => x.contestId.startsWith('sblive:'))!;
    const model = L.m.buildGameModel(L.ids.gameIdToParam(g.contestId))!;
    const note = g.provenance.backfill!.note.replace(/[.\s]+$/, '');
    expect(model.source?.text, 'components/game/game-model.ts source line').toBe(
      `Score via High School on SI (si.com): ${note}.`,
    );
    expect(model.source?.sbliveUrl, 'components/game/game-model.ts source link').toBe(g.urls.sblive);
    const html = await L.renderPage(L.ids.gameIdToParam(g.contestId));
    const text = textOf(html);
    expect(text, 'components/game/GameSources.tsx source line').toContain(`Score via High School on SI (si.com): ${note}.`);
    expect(text, 'components/ui/ScoreBoard.tsx † mark').toContain('† Score via si.com');
    expect(html, 'app/game/[id]/page.tsx').not.toContain('sblive:');
    expect(L.m.gameDescription(model), 'components/game/game-model.ts PCAL description').toContain(
      'in Pacific Coast Athletic League girls varsity field hockey, Fall 2026',
    );
  });

  it('a si.com score on a score-pending MaxPreps contest also carries the line', () => {
    const g = L.d.getGames().find((x) => !x.contestId.startsWith('sblive:') && x.provenance.scores === 'sblive');
    expect(g, 'lib/data.ts: the corpus has a rule-3 backfill').toBeDefined();
    const model = L.m.buildGameModel(g!.contestId)!;
    expect(model.source?.text, 'components/game/game-model.ts rule 3').toMatch(/^Score via High School on SI \(si\.com\): .+\.$/);
    expect(model.source?.maxprepsUrl, 'components/game/game-model.ts rule 3 MaxPreps link').toBe(g!.urls.maxpreps);
  });

  it('a plain disagreement keeps MaxPreps’ score and shows the note with both links', async () => {
    const g = L.d.getGames().find((x) => x.provenance.scoreConflict && x.provenance.scores !== 'sblive');
    expect(g, 'lib/data.ts: the corpus has a score conflict').toBeDefined();
    const model = L.m.buildGameModel(g!.contestId)!;
    expect(model.source, 'components/game/game-model.ts no source line on a MaxPreps score').toBeNull();
    expect(model.conflict?.note, 'components/game/game-model.ts conflict note').toBe(g!.provenance.scoreConflict!.note);
    expect(model.conflict?.sblive, 'components/game/game-model.ts conflict si.com value').toEqual(g!.provenance.scoreConflict!.sblive);
    const text = textOf(await L.renderPage(g!.contestId));
    expect(text, 'components/game/GameSources.tsx conflict').toContain(g!.provenance.scoreConflict!.note);
    expect(text, 'components/ui/ScoreBoard.tsx no † on a MaxPreps score').not.toContain('Score via si.com');
  });
});

describe('the cross-check paragraph under Elsewhere (components/game/GameSources.tsx GameElsewhere)', () => {
  /** The paragraph as every fixture-backed league and every non-league final has always printed it. */
  const FIXTURE_BACKED =
    'Scores come from MaxPreps and are cross-checked against High School on SI (si.com). When MaxPreps has no result for an official league game, or its row is clearly wrong, we publish si.com’s score and mark it; when both have a score and disagree, we publish MaxPreps’ and show the disagreement rather than choosing quietly.';

  it('is unchanged, as the whole paragraph, on a counted final of each fixture-backed league and on a non-league final', async () => {
    const nonLeague = L.d.getGames({ status: 'final' }).find((g) => g.countsFor === null && g.postseason === null)!;
    const games: Array<[string, Game]> = [
      ...['scval', 'bval', 'pcal', 'mcal'].map((league): [string, Game] => [league, counted(league)]),
      ['non-league', nonLeague],
    ];
    for (const [label, game] of games) {
      const html = await L.renderPage(L.ids.gameIdToParam(game.contestId));
      expect(html, `components/game/GameSources.tsx ${label} paragraph`).toContain(`>${FIXTURE_BACKED}</p>`);
      expect(html, `components/game/GameSources.tsx ${label}: no 1 v 1 clause`).not.toContain('1 v 1s');
    }
  });

  it('renders, with the fixture-backed wording, when a league-postseason tag names a league no longer configured', async () => {
    // The snapshot schema checks a tag's league id only for shape, so the lookup must not throw.
    const { GameElsewhere } = await import('../../components/game/GameSources');
    const nonLeague = L.d.getGames({ status: 'final' }).find((g) => g.countsFor === null && g.postseason === null)!;
    const model = L.m.buildGameModel(L.ids.gameIdToParam(nonLeague.contestId))!;
    const tagged = {
      ...model,
      game: { ...model.game, postseason: { kind: 'league-postseason', leagueId: 'not-a-league', via: 'league-postseason-window' } },
    } as unknown as typeof model;
    const html = renderToStaticMarkup(createElement(GameElsewhere, { model: tagged }));
    expect(html).toContain(`>${FIXTURE_BACKED}</p>`);
  });
});

describe('FormGoingIn non-member copy (components/game/FormGoingIn.tsx)', () => {
  it('names the 49 teams this site follows', async () => {
    const g = L.d.getGames().find((x) => (x.home.slug === null) !== (x.away.slug === null))!;
    const { FormGoingIn } = await import('../../components/game/FormGoingIn');
    const html = renderToStaticMarkup(createElement(FormGoingIn, { model: L.m.buildGameModel(g.contestId)! }));
    expect(textOf(html), 'components/game/FormGoingIn.tsx').toContain(
      'Not one of the 49 teams this site follows — no record is kept here.',
    );
  });
});

describe('MCAL postseason note and superseded stubs (corpus copy)', () => {
  let S: Loaded;
  let tournament: Game;
  let target: Game;
  let flagged: Game;
  const SUPERSEDED = 'sblive:999999';

  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(corpusPath, 'utf8')) as Snapshot;
    const mcalIds = new Set(snap.teams.filter((t) => t.league === 'mcal').map((t) => t.id));
    const oneGoal = snap.games.find(
      (g) =>
        mcalIds.has(g.home.teamId ?? '') &&
        mcalIds.has(g.away.teamId ?? '') &&
        g.status === 'final' &&
        Math.abs((g.home.score ?? 0) - (g.away.score ?? 0)) === 1,
    )!;
    oneGoal.postseason = { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' };
    oneGoal.countsFor = null;
    tournament = oneGoal;
    target = snap.games.find((g) => g.countsFor !== null && !g.contestId.startsWith('sblive:') && mcalIds.has(g.home.teamId ?? ''))!;
    snap.supersededGames = { [SUPERSEDED]: target.contestId };
    // A level non-league final MaxPreps flags W/L (the Gilroy–University shape): a single meeting.
    const pairKey = (g: Game) => [g.home.slug ?? g.home.name, g.away.slug ?? g.away.name].sort().join('|');
    const pairs = new Map<string, number>();
    for (const g of snap.games) pairs.set(pairKey(g), (pairs.get(pairKey(g)) ?? 0) + 1);
    flagged = snap.games.find(
      (g) =>
        g.status === 'final' &&
        g.countsFor === null &&
        g.postseason === null &&
        !g.provenance.backfill &&
        !g.contestId.startsWith('sblive:') &&
        (g.home.slug === null) !== (g.away.slug === null) &&
        pairs.get(pairKey(g)) === 1,
    )!;
    flagged.home.score = 0;
    flagged.away.score = 0;
    flagged.home.result = 'L';
    flagged.away.result = 'W';
    flagged.provenance.resultConflict = `MaxPreps marks ${flagged.home.name} L and ${flagged.away.name} W on a 0-0 score.`;
    flagged.provenance.scoreConflict = undefined;
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-game-view-'));
    const file = path.join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    process.env.SCVAL_SNAPSHOT = file;
    S = await loadModules();
  }, 600_000);

  it('an MCAL tournament game: the not-counted sentence and the shootout caveat', async () => {
    const model = S.m.buildGameModel(tournament.contestId)!;
    const { SHOOTOUT_NOTE } = await import('../../lib/postseason');
    expect(model.postseasonNotes, 'components/game/game-model.ts MCAL postseason notes').toEqual([
      'MCAL tournament game — it does not count in the league table.',
      SHOOTOUT_NOTE,
    ]);
    expect(model.contextLabel, 'components/game/game-model.ts MCAL tournament kicker').toMatch(/^MCAL (tournament|play-in|quarterfinal|semifinal|final)$/);
    const text = textOf(await S.renderPage(tournament.contestId));
    expect(text, 'app/game/[id]/page.tsx MCAL note').toContain('MCAL tournament game — it does not count in the league table.');
    expect(text, 'app/game/[id]/page.tsx shootout caveat').toContain(SHOOTOUT_NOTE);
    expect(text, 'app/game/[id]/page.tsx MCAL: no CCS concept').not.toMatch(/automatic qualifier|at-large|CCS picture/i);
  });

  it('a level final MaxPreps flags W/L: the note under the score, and the series never says just "a draw"', async () => {
    expect(flagged, 'tests: a single-meeting non-league final in the corpus').toBeDefined();
    const model = S.m.buildGameModel(flagged.contestId)!;
    expect(model.resultConflictNote, 'components/game/game-model.ts resultConflictNote').toBe(
      `${flagged.provenance.resultConflict!.replace(/\.$/, '')}. The score is level, so this site counts it as a tie.`,
    );
    expect(model.series.summary, 'components/game/game-model.ts series summary').toBe(
      `Their only meeting this season ended 0-0, which this site counts as a draw; MaxPreps lists ${model.away.name} as the winner.`,
    );
    expect(model.series.summary).not.toContain('was a draw.');
    const text = textOf(await S.renderPage(flagged.contestId));
    expect(text, 'components/game/GameSources.tsx ResultFlagConflict').toContain('The score is level, so this site counts it as a tie.');
    // A backfilled game explains itself in the source line instead.
    const plain = S.m.buildGameModel(tournament.contestId)!;
    expect(plain.resultConflictNote, 'components/game/game-model.ts: no conflict, no note').toBeNull();
  });

  it('a superseded si.com id is a stub page, in both param lists, canonical to the MaxPreps game', async () => {
    const page = S.pageParams();
    expect(S.ogParams(), 'app/game/[id]/opengraph-image.tsx: OG params === page params (stubs)').toEqual(page);
    expect(page.map((p) => p.id), 'components/game/game-model.ts stub param').toContain('sblive-999999');
    const stub = S.m.buildSupersededStub('sblive-999999')!;
    expect(stub.sentence, 'components/game/game-model.ts stub sentence').toBe('MCAL game — this result is now on MaxPreps.');
    expect(stub.targetHref, 'components/game/game-model.ts stub target').toBe(S.ids.gameHref(target.contestId));
    const html = await S.renderPage('sblive-999999');
    expect(textOf(html), 'app/game/[id]/page.tsx stub').toContain('MCAL game — this result is now on MaxPreps.');
    expect(html, 'app/game/[id]/page.tsx stub link').toContain(`href="${stub.targetHref}"`);
    const meta = await S.metadata('sblive-999999');
    expect(meta.alternates?.canonical, 'app/game/[id]/page.tsx stub canonical').toBe(stub.targetHref);
    expect(S.m.buildGameModel('sblive-999999'), 'components/game/game-model.ts: a stub has no game model').toBeUndefined();
  });
});
