/**
 * The notes under a score (views/game/notes.ts, series.ts, postseason.ts; SPEC §10.6): the MCAL postseason note, the
 * superseded-stub pages and the Southern California games. They do not occur in the corpus, so each block runs on a
 * copy of it with synthetic games (and one `supersededGames` entry).
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6; the fixture is
 * tests/support/game-view.ts). Every assertion message names the module that produced the value.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Game } from '@/lib/model/game';
import type { Snapshot } from '@/lib/model/snapshot';
import { CORPUS_HOOK_TIMEOUT } from '@/tests/support/corpus-modules';
import { textOf } from '@/tests/support/html-text';
import { tempDir, tempFile } from '@/tests/support/repo';
import { type Loaded, loadFrom, corpusPath } from '@/tests/support/game-view';

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
    // Every opponent in the corpus that was not one of the 49 was a San Diego school, and all of them are
    // registry teams now (99): one single-meeting non-league final gets an away side from outside the
    // registry, so the corpus copy has a game against a non-member again.
    const outside = snap.games.find(
      (g) =>
        g.status === 'final' &&
        g.countsFor === null &&
        g.postseason === null &&
        !g.provenance.backfill &&
        !g.contestId.startsWith('sblive:') &&
        g.home.slug !== null &&
        g.away.slug !== null &&
        pairs.get(pairKey(g)) === 1,
    )!;
    outside.away = { ...outside.away, teamId: 'eeeeeeee-0000-4000-8000-0000000000ee', slug: null, name: 'Outside Prep' };
    outside.leagueDivision = null;
    pairs.set(pairKey(outside), 1);
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
    const dir = tempDir('game-view');
    const file = path.join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    S = await loadFrom(file);
  }, CORPUS_HOOK_TIMEOUT);

  it('FormGoingIn names the 102 teams this site follows for a side outside them (components/game/FormGoingIn.tsx)', async () => {
    const g = S.d.getGames().find((x) => (x.home.slug === null) !== (x.away.slug === null))!;
    expect(g, 'tests: the corpus copy has a game against a non-member').toBeDefined();
    const { FormGoingIn } = await import('@/components/game/FormGoingIn');
    const html = renderToStaticMarkup(createElement(FormGoingIn, { model: S.m.buildGameView(g.contestId)! }));
    expect(textOf(html), 'components/game/FormGoingIn.tsx').toContain(
      'Not one of the 102 teams this site follows — no record is kept here.',
    );
  });

  it('an MCAL tournament game: the not-counted sentence and the shootout caveat', async () => {
    const model = S.m.buildGameView(tournament.contestId)!;
    const { SHOOTOUT_NOTE } = await import('@/lib/engine/postseason');
    expect(model.postseasonNotes, 'views/game/game-view.ts MCAL postseason notes').toEqual([
      'MCAL tournament game — it does not count in the league table.',
      SHOOTOUT_NOTE,
    ]);
    expect(model.contextLabel, 'views/game/game-view.ts MCAL tournament kicker').toMatch(/^MCAL (tournament|play-in|quarterfinal|semifinal|final)$/);
    const text = textOf(await S.renderPage(tournament.contestId));
    expect(text, 'app/game/[id]/page.tsx MCAL note').toContain('MCAL tournament game — it does not count in the league table.');
    expect(text, 'app/game/[id]/page.tsx shootout caveat').toContain(SHOOTOUT_NOTE);
    expect(text, 'app/game/[id]/page.tsx MCAL: no CCS concept').not.toMatch(/automatic qualifier|at-large|CCS picture/i);
  });

  it('a level final MaxPreps flags W/L: the note under the score, and the series never says just "a draw"', async () => {
    expect(flagged, 'tests: a single-meeting non-league final in the corpus').toBeDefined();
    const model = S.m.buildGameView(flagged.contestId)!;
    expect(model.resultConflictNote, 'views/game/game-view.ts resultConflictNote').toBe(
      `${flagged.provenance.resultConflict!.replace(/\.$/, '')}. The score is level, so this site counts it as a tie.`,
    );
    expect(model.series.summary, 'views/game/game-view.ts series summary').toBe(
      `Their only meeting this season ended 0-0, which this site counts as a draw; MaxPreps lists ${model.away.name} as the winner.`,
    );
    expect(model.series.summary).not.toContain('was a draw.');
    const text = textOf(await S.renderPage(flagged.contestId));
    expect(text, 'components/game/GameSources.tsx ResultFlagConflict').toContain('The score is level, so this site counts it as a tie.');
    // A backfilled game explains itself in the source line instead.
    const plain = S.m.buildGameView(tournament.contestId)!;
    expect(plain.resultConflictNote, 'views/game/game-view.ts: no conflict, no note').toBeNull();
  });

  it('a superseded si.com id is a stub page, in both param lists, canonical to the MaxPreps game', async () => {
    const page = S.pageParams();
    expect(S.ogParams(), 'app/game/[id]/opengraph-image.tsx: OG params === page params (stubs)').toEqual(page);
    expect(page.map((p) => p.id), 'views/game/game-view.ts stub param').toContain('sblive-999999');
    const stub = S.m.buildSupersededStub('sblive-999999')!;
    expect(stub.sentence, 'views/game/game-view.ts stub sentence').toBe('MCAL game — this result is now on MaxPreps.');
    expect(stub.targetHref, 'views/game/game-view.ts stub target').toBe(S.ids.gameHref(target.contestId));
    const html = await S.renderPage('sblive-999999');
    expect(textOf(html), 'app/game/[id]/page.tsx stub').toContain('MCAL game — this result is now on MaxPreps.');
    expect(html, 'app/game/[id]/page.tsx stub link').toContain(`href="${stub.targetHref}"`);
    const meta = await S.metadata('sblive-999999');
    expect(meta.alternates?.canonical, 'app/game/[id]/page.tsx stub canonical').toBe(stub.targetHref);
    expect(S.m.buildGameView('sblive-999999'), 'views/game/game-view.ts: a stub has no game model').toBeNull();
  });
});

describe('Southern California games (corpus copy with synthetic SoCal games, DESIGN-socal §2.1)', () => {
  let C: Loaded;
  let shootoutWin: Game;
  let playoff: Game;
  let crossDivision: Game;
  let counted: Game;
  let sunsetTie: Game;

  beforeAll(async () => {
    const { game } = await import('@/tests/support/game-builder');
    const { loadSnapshot } = await import('@/lib/snapshot/load');
    const { computeStandings } = await import('@/lib/engine/standings');
    const { countsOf } = await import('@/lib/snapshot/migrate');
    const { getLeague } = await import('@/lib/config/leagues');
    const base = loadSnapshot(JSON.parse(readFileSync(corpusPath, 'utf8')) as unknown);
    // Clairemont (City Eastern) 0, Eastlake (Metro Mesa) 0, flagged W/L, Sep 1: a San Diego shootout win
    // between two conferences, so no table counts it.
    shootoutWin = game({ home: 'clairemont', away: 'eastlake', hs: 0, as: 0, date: '2026-09-01', league: false, results: { home: 'L', away: 'W' } });
    // A Section playoff game between two conferences: the tag carries no league.
    playoff = game({ home: 'la-jolla', away: 'torrey-pines', date: '2026-11-05' });
    // Mission Bay (City Western) at Clairemont (City Eastern), flagged by MaxPreps: neither table.
    crossDivision = game({ home: 'clairemont', away: 'mission-bay', hs: 2, as: 1, date: '2026-09-16' });
    counted = game({ home: 'la-jolla', away: 'scripps-ranch', hs: 2, as: 1, date: '2026-09-15', league: false });
    sunsetTie = game({ home: 'bonita', away: 'marina', hs: 1, as: 1, date: '2026-08-18' });
    const games = [...base.games, shootoutWin, playoff, crossDivision, counted, sunsetTie];
    const socal = new Set(['sunset', 'city', 'north-county', 'metro'].flatMap((id) => getLeague(id).divisions.map((d) => d.id)));
    const rows = new Map(computeStandings(games).filter((r) => socal.has(r.division)).map((r) => [r.teamId, r]));
    const standings = base.standings.map((r) => rows.get(r.teamId) ?? r);
    const snap: Snapshot = { ...base, games, standings, counts: countsOf(games, standings) };
    const file = tempFile('game-view-socal', 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    C = await loadFrom(file);
  }, CORPUS_HOOK_TIMEOUT);

  it('a San Diego level final MaxPreps marks W/L: the win credited, no SO tag, the rule cited, no shootout asserted', () => {
    // SectionConfig.shootout.inference 'unverified': si.com and the Section's power rankings record
    // Mt. Carmel–Poway (Sep 11) as 2-0 where MaxPreps has 0-0 marked W/L, so no view says a shootout decided
    // this game. (A team page's "Earlier:" line is views/teams/team-view.ts, pinned with it.)
    const model = C.m.buildGameView(shootoutWin.contestId)!;
    expect(model.game.decider).toBe('SO');
    expect(model.display.deciderTag, 'views/shared/describe-game.ts deciderTagFor').toBeNull();
    expect(model.display.shootoutLabel, 'views/shared/describe-game.ts shootoutLabel').toBeNull();
    expect([model.display.home.chip, model.display.away.chip]).toEqual(['L', 'W']);
    expect(model.display.sentence, 'views/shared/describe-game.ts sentence').toBe(
      'Clairemont 0, Eastlake 0, final; Eastlake credited with the win (MaxPreps lists 0–0 with no tally).',
    );
    expect(model.scoreNote, 'views/game/game-view.ts scoreNote').toBe(
      'MaxPreps lists 0–0 with no tally and marks Eastlake the winner; a level San Diego Section varsity game outside a tournament goes to a sudden-victory period and then a shootout (San Diego Field Hockey Officials Association 2026 Mercy & Overtime Procedures), so this site counts it as Eastlake’s win. si.com and the Section’s power rankings record some of these games with a decisive score (Mt. Carmel–Poway, Sep 11: 2-0).',
    );
    expect(model.scoreNote).not.toMatch(/decided it|1 v 1s/);
    expect(C.titles.gameTitle(model)).not.toContain('(SO)');
    expect(C.titles.gameKicker(model)).not.toContain('SO');
  });

  it('the D24 sentence names the San Diego Section and its shootout (components/game/GameSources.tsx)', async () => {
    const { GameElsewhere } = await import('@/components/game/GameSources');
    const html = renderToStaticMarkup(createElement(GameElsewhere, { model: C.m.buildGameView(shootoutWin.contestId)! }));
    expect(textOf(html)).toContain(
      'A level si.com score between two San Diego Section teams is never used: a varsity game there outside a tournament is decided by a shootout, and si.com does not say who won it.',
    );
    expect(textOf(html)).not.toContain('1 v 1s');
    // A Sunset pair has no shootout rule: no such sentence.
    const sunset = renderToStaticMarkup(createElement(GameElsewhere, { model: C.m.buildGameView(sunsetTie.contestId)! }));
    expect(textOf(sunset)).not.toMatch(/never used: a varsity game there/);
  });

  it('says under When that a date was corrected, from what, and on whose word (components/game/GameDetails.tsx)', async () => {
    const { GameDetails } = await import('@/components/game/GameDetails');
    const model = C.m.buildGameView(counted.contestId)!;
    const plain = textOf(renderToStaticMarkup(createElement(GameDetails, { model })));
    expect(plain).not.toContain('Date corrected');
    const source = 'CIF-SDS power-rankings details, school_id 662 (Fallbrook) and 746 (Valley Center): both list the game on 09/29/2026 with no time; MaxPreps dates it 09/25 at 4:00 PM, the same slot as Fallbrook’s game against Rancho Buena Vista';
    const corrected = {
      ...model,
      game: {
        ...model.game,
        dateLocal: '2026-09-29T00:00:00', dateUtc: '2026-09-29T07:00:00Z', dateKey: '2026-09-29', isTimeTba: true,
        provenance: { ...model.game.provenance, dateCorrection: { maxprepsDateLocal: '2026-09-25T16:00:00', maxprepsTimeTba: false, source } },
      },
    };
    const text = textOf(renderToStaticMarkup(createElement(GameDetails, { model: corrected })));
    expect(text).toContain('Time TBA');
    expect(text).toContain(`Date corrected from MaxPreps’ Sep 25 — ${source}.`);
  });

  it('a San Diego Section playoff game: one label, whether or not the sides share a conference', () => {
    const model = C.m.buildGameView(playoff.contestId)!;
    expect(model.game.postseason).toEqual({ kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' });
    expect(model.contextLabel).toBe('San Diego Section playoffs');
    expect(model.postseasonNotes).toEqual(['San Diego Section playoffs game — it does not count in the league table.']);
    expect(model.countsAs).toEqual({
      label: 'San Diego Section playoffs',
      detail: 'San Diego Section playoffs game — it does not count in the league table.',
      classificationNote: null,
    });
    expect(model.display.postseasonTag, 'views/shared/describe-game.ts postseasonTagOf').toBe('San Diego Section playoffs');
  });

  it('a game MaxPreps flags between two City divisions: non-league, with the classifier’s note', () => {
    const model = C.m.buildGameView(crossDivision.contestId)!;
    expect(model.countsAs).toEqual({
      label: 'Non-league game',
      detail: 'Counts in the overall record only, never in a league table.',
      classificationNote:
        'MaxPreps marks this as a league game; it is between two divisions of the City Conference, so it counts in neither table.',
    });
  });

  it('a counted San Diego game names its league without "Division" and cites this site’s points', () => {
    const model = C.m.buildGameView(counted.contestId)!;
    expect(model.game.countsFor).toBe('city-western');
    expect(model.countsAs.label).toBe('League game · City Western');
    expect(model.countsAs.detail).toBe(
      'Counts toward the City Western standings — this site’s 3-1-0 points (the league publishes no points rule).',
    );
    expect(C.titles.gameDescription(model)).toMatch(/ City Western league game against .+\. City Conference girls varsity field hockey/);
    expect(C.titles.gameDescription(model)).not.toMatch(/City Western Division/);
  });
});
