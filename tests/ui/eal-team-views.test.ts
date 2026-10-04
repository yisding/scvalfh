/**
 * The team, game and /teams pages on the EAL corpus (spec D5, D7, D9): a Davis page with its Super
 * Regional picture and no CCS concept or seed word, the 9/28 Chico-Davis game decided on 1 v 1s,
 * the 9/2 Pleasant Valley game whose three overtime periods the EAL's rules rule out, a Super
 * Regional game, and the membership note under the EAL heading on /teams.
 *
 * The EAL has no official schedule (`official.mode: 'none'`), so a team page links none; its
 * postseason is the Super Regional, an unbracketed tournament, so no page draws a bracket. These
 * tests run on the EAL corpus (SCVAL_SNAPSHOT pointed at it BEFORE lib/data is imported, with the
 * modules re-imported after `vi.resetModules()`). Every expected value is read from the snapshot or
 * from config; every assertion message names the module that produced the value.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game, Snapshot } from '../../lib/types';
import { EAL_CORPUS, corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type View = typeof import('../../components/teams/team-view');
type GameModelModule = typeof import('../../components/game/game-model');

interface Loaded {
  d: Data;
  l: Leagues;
  v: View;
  gm: GameModelModule;
  renderTeam: (slug: string) => Promise<string>;
  renderGame: (contestId: string) => Promise<string>;
  renderIndex: () => string;
  describeTeam: (slug: string) => Promise<string | undefined>;
}

const priorEnv = process.env.SCVAL_SNAPSHOT;
let eal: Loaded;
let withTag: Loaded;
let tagged: Game;

/** CCS concepts and seed words no EAL view may carry (spec D21, D10). */
const BANNED = /\bCCS\b|at-large|automatic qualifier|\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i;

async function load(snapshotPath: string): Promise<Loaded> {
  process.env.SCVAL_SNAPSHOT = snapshotPath;
  vi.resetModules();
  const d = await import('../../lib/data');
  const l = await import('../../lib/leagues');
  const v = await import('../../components/teams/team-view');
  const gm = await import('../../components/game/game-model');
  const teamPage = await import('../../app/teams/[slug]/page');
  const gamePage = await import('../../app/game/[id]/page');
  const indexPage = (await import('../../app/teams/page')).default;
  return {
    d,
    l,
    v,
    gm,
    renderTeam: async (slug) =>
      renderToStaticMarkup((await teamPage.default({ params: Promise.resolve({ slug }) } as never)) as ReactElement),
    renderGame: async (contestId) =>
      renderToStaticMarkup(
        (await gamePage.default({ params: Promise.resolve({ id: contestId }) } as never)) as ReactElement,
      ),
    renderIndex: () => renderToStaticMarkup(createElement(indexPage)),
    describeTeam: async (slug) => {
      const meta = await teamPage.generateMetadata({ params: Promise.resolve({ slug }) } as never);
      return typeof meta.description === 'string' ? meta.description : undefined;
    },
  };
}

/** The one EAL game between these two teams on a date. */
function gameOn(m: Loaded, a: string, b: string, dateKey: string): Game {
  const game = m.d
    .getGames({ teamId: a })
    .find((g) => g.dateKey === dateKey && [g.home.slug, g.away.slug].includes(b));
  if (!game) throw new Error(`no ${a} / ${b} game on ${dateKey} in the EAL corpus`);
  return game;
}

beforeAll(async () => {
  const path0 = corpusSnapshotPath(EAL_CORPUS);
  eal = await load(path0);

  // A copy of the corpus in which one scheduled EAL league game is tagged a Super Regional game:
  // no league game is that late in the capture, so the tag is written by hand (the pipeline writes
  // it for a contest type 4 or a date on or after the league's `postseasonFrom`).
  const snap = JSON.parse(readFileSync(path0, 'utf8')) as Snapshot;
  const target = snap.games.find(
    (g) => g.status === 'scheduled' && g.countsFor !== null && g.home.slug === 'chico' && g.away.slug === 'lassen',
  );
  if (!target) throw new Error('the EAL corpus has no scheduled Lassen at Chico game to tag');
  target.countsFor = null;
  target.leagueDivision = null;
  target.postseason = { kind: 'league-postseason', leagueId: 'eal', via: 'league-postseason-window' };
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-eal-team-views-'));
  const file = path.join(dir, 'snapshot.json');
  writeFileSync(file, JSON.stringify(snap));
  withTag = await load(file);
  tagged = withTag.d.getGameById(target.contestId)!;
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

describe('an EAL team page (/teams/davis)', () => {
  it('reads Super Regional picture, states the Super Regional line, and carries no CCS concept or seed word', async () => {
    const league = eal.l.getLeague('eal');
    const ps = league.postseason;
    if (ps.kind !== 'unbracketed-tournament') throw new Error('lib/leagues.ts: the EAL postseason is unbracketed');
    const html = await eal.renderTeam('davis');
    const text = textOf(html);
    expect(text, 'app/teams/[slug]/page.tsx kicker').toContain(`${ps.name} picture`);
    expect(text, 'app/teams/[slug]/page.tsx kicker').toContain('Super Regional picture');
    const line = eal.d.getTeamPostseasonLine('davis');
    expect(line, 'lib/data.ts getTeamPostseasonLine').not.toBeNull();
    expect(text, 'components/teams/TeamPlayoffLine.tsx sentence').toContain(
      'The top six schools play the Super Regional, Oct 30–31; its format and site are not published yet.',
    );
    expect(html, 'components/teams/TeamPlayoffLine.tsx link').toContain('href="/playoffs#eal"');
    expect(text, 'app/teams/[slug]/page.tsx').not.toMatch(BANNED);
    expect(text, 'app/teams/[slug]/page.tsx: no CCS').not.toContain('CCS');
    expect(html, 'app/teams/[slug]/page.tsx: no bracket link').not.toContain('Official CCS bracket');
    expect(await eal.describeTeam('davis'), 'app/teams/[slug]/page.tsx description').toMatch(
      /goal margins and Super Regional picture\.$/,
    );
  });

  it('links no official schedule, for any team of the league (it publishes none)', async () => {
    for (const team of eal.d.getTeams({ league: 'eal' })) {
      const v = eal.v.buildTeamPageView(team.slug)!;
      expect(v.officialScheduleUrl, `components/teams/team-view.ts ${team.slug}`).toBeNull();
      const text = textOf(await eal.renderTeam(team.slug));
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}`).not.toMatch(/Official EAL schedule|official EAL schedule/);
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}`).not.toMatch(BANNED);
    }
  });

  it('puts the end-of-season sentence and the no-bracket sentence on the NEXT card', async () => {
    const copy = eal.v.leagueCopy('eal');
    expect(copy.seasonEndSentence).toBe('The EAL league season ends Wed Oct 28; the Super Regional follows, Oct 30–31.');
    expect(copy.bracketSentence).toBe(
      'We will not guess a bracket: the Super Regional’s format and site are not published yet.',
    );
  });

  it('counts the 1 v 1 win in the table: Chico 4-1-0 and Davis 3-2-0, as MaxPreps has them', () => {
    const chico = eal.v.buildTeamPageView('chico')!;
    const davis = eal.v.buildTeamPageView('davis')!;
    const record = (v: typeof chico) => `${v.standing!.computed.w}-${v.standing!.computed.l}-${v.standing!.computed.t}`;
    expect(record(chico), 'components/teams/team-view.ts chico').toBe('4-1-0');
    expect(record(davis), 'components/teams/team-view.ts davis').toBe('3-2-0');
    // The form strips go through the same outcome rule: Chico's last result is the win.
    expect(chico.formEntries.at(-1)?.outcome, 'components/teams/team-view.ts chico form').toBe('W');
    expect(davis.formEntries.at(-1)?.outcome, 'components/teams/team-view.ts davis form').toBe('L');
  });

  it('words an earlier 1 v 1 meeting as won 1–1 on 1 v 1s, never "in SO"', () => {
    const chico = eal.d.getTeamBySlug('chico')!;
    const davis = eal.d.getTeamBySlug('davis')!;
    const decided = gameOn(eal, 'chico', 'davis', '2026-09-28');
    const later = eal.d.getGames({ teamId: 'chico' }).find(
      (g) => g.dateKey > decided.dateKey && [g.home.slug, g.away.slug].includes('davis'),
    );
    expect(later, 'the corpus has the return meeting').toBeDefined();
    const earlier = eal.v.earlierMeeting(chico, davis, later!.dateLocal);
    expect(earlier?.contestId, 'components/teams/team-view.ts earlierMeeting').toBe(decided.contestId);
    expect(earlier?.text, 'components/teams/team-view.ts earlierMeeting').toBe(
      `Earlier: won 1–1 on 1 v 1s ${decided.home.slug === 'chico' ? 'at home' : 'away'}, Sep 28`,
    );
    const theirs = eal.v.earlierMeeting(davis, chico, later!.dateLocal);
    expect(theirs?.text, 'components/teams/team-view.ts earlierMeeting (Davis)').toMatch(/^Earlier: lost 1–1 on 1 v 1s /);
    expect(`${earlier?.text} ${theirs?.text}`).not.toMatch(/ in SO\b/);
  });

  it('headlines the 1 v 1 game with its SO tag, from either side', () => {
    const decided = gameOn(eal, 'chico', 'davis', '2026-09-28');
    expect(eal.v.gameHeadline(decided, eal.d.getTeamBySlug('chico')!)).toMatch(/^W 1–1 .* SO$/);
    expect(eal.v.gameHeadline(decided, eal.d.getTeamBySlug('davis')!)).toMatch(/^L 1–1 .* SO$/);
  });
});

describe('the 9/28 Chico-Davis game page (decider SO, no stored tally)', () => {
  it('names Chico first, tags it (SO), and says MaxPreps marks Chico the winner and the tally is not shown', async () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    expect(game.decider, 'lib/normalize.ts decider').toBe('SO');
    expect(game.shootout, 'lib/normalize.ts shootout').toBeNull();
    const model = eal.gm.buildGameModel(game.contestId)!;
    const title = eal.gm.gameTitle(model);
    expect(title.startsWith('Chico 1, Davis 1 (SO)'), `components/game/game-model.ts gameTitle: ${title}`).toBe(true);
    expect(eal.gm.gameKicker(model), 'components/game/game-model.ts gameKicker').toContain('SO');
    const rule = `${eal.l.getSection('ns').name} Field Hockey Guidelines §VII.E.4`;
    expect(model.scoreNote, 'components/game/game-model.ts scoreNote').toBe(
      `Level at 1–1; MaxPreps marks Chico the winner, which under the EAL’s rules means 1 v 1s decided it (a level varsity game goes to a 10-minute sudden-victory period, then 1 v 1s: ${rule}). This site counts it as Chico’s win and does not show the 1 v 1 tally.`,
    );
    expect(model.resultConflictNote, 'components/game/game-model.ts: no level-score-marked-W/L note').toBeNull();
    const text = textOf(await eal.renderGame(game.contestId));
    expect(text, 'app/game/[id]/page.tsx note').toContain(model.scoreNote!);
    expect(text, 'app/game/[id]/page.tsx').not.toMatch(/counts it as a tie|level, so this site counts/);
    expect(model.display.sentence, 'components/ui/game-view.ts sentence').toBe(
      'Chico 1, Davis 1, final; Chico won on 1 v 1s.',
    );
  });

  it('counts it as a win in the season series', () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    const summary = eal.gm.buildGameModel(game.contestId)!.series.summary;
    expect(summary, 'components/game/game-model.ts series summary').toMatch(/^Chico leads the season series 1-0\./);
    expect(summary, 'components/game/game-model.ts series summary').not.toMatch(/draw|level/);
  });

  it('gives each side its outcome chip: Chico W, Davis L', () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    const model = eal.gm.buildGameModel(game.contestId)!;
    const chico = [model.home, model.away].find((s) => s.team?.slug === 'chico')!;
    const davis = [model.home, model.away].find((s) => s.team?.slug === 'davis')!;
    expect(chico.outcome, 'components/game/game-model.ts chico').toBe('W');
    expect(davis.outcome, 'components/game/game-model.ts davis').toBe('L');
  });
});

describe('the 9/2 Pleasant Valley at Chico game page (3 overtime periods, impossible under the rules)', () => {
  it('shows no overtime tag, and carries the note that MaxPreps may have recorded a 1 v 1 as a goal', async () => {
    const game = gameOn(eal, 'chico', 'pleasant-valley', '2026-09-02');
    expect(game.otPeriods, 'lib/normalize.ts otPeriods as MaxPreps has it').toBe(3);
    const model = eal.gm.buildGameModel(game.contestId)!;
    expect(model.display.deciderTag, 'components/ui/game-view.ts deciderTag').toBeNull();
    expect(eal.gm.gameTitle(model), 'components/game/game-model.ts gameTitle').not.toMatch(/\bOT\b|overtime/i);
    expect(eal.gm.gameKicker(model), 'components/game/game-model.ts gameKicker').not.toMatch(/\bOT\b/);
    expect(model.display.sentence, 'components/ui/game-view.ts sentence').toBe(
      'Chico 0, Pleasant Valley 1, final.',
    );
    const rule = `${eal.l.getSection('ns').name} Field Hockey Guidelines §VII.E.4`;
    expect(model.scoreNote, 'components/game/game-model.ts scoreNote').toBe(
      `MaxPreps records 3 overtime periods for this game, but the EAL plays one 10-minute overtime period and then 1 v 1s (${rule}), so MaxPreps may have recorded a 1 v 1 win as a goal. The score is shown as MaxPreps has it.`,
    );
    const text = textOf(await eal.renderGame(game.contestId));
    expect(text, 'app/game/[id]/page.tsx note').toContain(model.scoreNote!);
    expect(text, 'app/game/[id]/page.tsx: no overtime tag').not.toMatch(/\b2 OT\b|after overtime/);
  });

  it('keeps the same quiet on the team page rows and the earlier-meeting line', async () => {
    const game = gameOn(eal, 'chico', 'pleasant-valley', '2026-09-02');
    const html = await eal.renderTeam('chico');
    const text = textOf(html);
    expect(html, 'app/teams/[slug]/page.tsx: the game is linked').toContain(`href="/game/${game.contestId}"`);
    expect(text, 'app/teams/[slug]/page.tsx: no OT tag on a team page').not.toMatch(/\b2 OT\b/);
    const earlier = eal.v.earlierMeeting(
      eal.d.getTeamBySlug('chico')!,
      eal.d.getTeamBySlug('pleasant-valley')!,
      '2026-10-06',
    );
    expect(earlier?.text, 'components/teams/team-view.ts earlierMeeting').toBe('Earlier: lost 0–1 at home, Sep 2');
  });
});

describe('a Super Regional game (tag league-postseason)', () => {
  it('says it does not count in the league table, under the EAL Super Regional label', async () => {
    expect(tagged.postseason?.kind, 'the hand-tagged corpus copy').toBe('league-postseason');
    const model = withTag.gm.buildGameModel(tagged.contestId)!;
    expect(model.postseasonNotes, 'components/game/game-model.ts postseasonNotes').toEqual([
      'Super Regional game — it does not count in the league table.',
    ]);
    expect(model.contextLabel, 'components/game/game-model.ts contextLabel').toBe('EAL Super Regional');
    expect(model.countsAs.label, 'components/game/game-model.ts countsAs').toBe('EAL Super Regional');
    const text = textOf(await withTag.renderGame(tagged.contestId));
    expect(text, 'app/game/[id]/page.tsx').toContain('Super Regional game — it does not count in the league table.');
    expect(text, 'app/game/[id]/page.tsx').not.toMatch(/\bCCS\b/);
    expect(withTag.gm.gameDescription(model), 'components/game/game-model.ts gameDescription').toContain(
      'an EAL Super Regional game',
    );
  });
});

describe('/teams on the EAL corpus', () => {
  it('prints the membership note under the EAL heading, and only there', () => {
    const note = eal.l.getLeague('eal').membershipNote!;
    expect(note).toBeTruthy();
    const html = eal.renderIndex();
    // The league's SectionHeader carries the id on its wrapper; the h3 is inside it.
    const header = html.search(/\sid="eal"/);
    expect(header, 'app/teams/page.tsx EAL heading').toBeGreaterThan(0);
    expect(html.slice(header, header + 400), 'app/teams/page.tsx EAL h3').toContain('<h3');
    const after = textOf(html.slice(header, header + 4000));
    expect(after.indexOf(note), 'app/teams/page.tsx membership note under the h3').toBeGreaterThanOrEqual(0);
    expect(after.indexOf(note), 'app/teams/page.tsx membership note comes before the table').toBeLessThan(
      after.indexOf('Bella Vista'),
    );
    expect(textOf(html).split(note).length - 1, 'app/teams/page.tsx note appears once').toBe(1);
    const groups = eal.v.buildTeamsByLeague().flatMap((s) => s.leagues);
    expect(groups.filter((g) => g.membershipNote).map((g) => g.league.id), 'components/teams/team-view.ts groups').toEqual(['eal']);
    expect(groups.length, 'components/teams/team-view.ts five league groups').toBe(5);
  });

  it('states what the six EAL teams are, and carries no seed word', () => {
    const text = textOf(eal.renderIndex());
    expect(text, 'app/teams/page.tsx').toContain(
      'the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026.',
    );
    expect(text, 'app/teams/page.tsx').not.toMatch(/\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i);
  });
});
