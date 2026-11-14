/**
 * The team, game and /teams pages on the EAL corpus (spec D5, D7, D9): a Davis page with its Super
 * Regional picture and no CCS concept or seed word, the 9/28 Chico-Davis game decided on 1 v 1s,
 * the 9/2 Pleasant Valley game whose three overtime periods the EAL's rules rule out, the game page's
 * cross-check paragraph (no "official" schedule, D23; the 1 v 1 exception, D24), a Super
 * Regional game, and the membership note under the EAL heading on /teams.
 *
 * The EAL has no official schedule (`official.mode: 'none'`), so a team page links none; its
 * postseason is the Super Regional, an unbracketed tournament, so no page draws a bracket. These
 * tests run on the EAL corpus (SCVAL_SNAPSHOT pointed at it BEFORE lib/data is imported, with the
 * modules re-imported after `vi.resetModules()`). Expected values are read from the snapshot or from
 * config where the test can derive them; the rest (Chico 4-1-0 and Davis 3-2-0, the 1-0 season series,
 * the three overtime periods and the 'Earlier:' lines) are those of the frozen eal-2026-10-04 corpus.
 * Every assertion message names the module that produced the value.
 */

import { readFileSync } from 'node:fs';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game, Snapshot } from '../../lib/types';
import { EAL_CORPUS, corpusSnapshotPath, writeTempSnapshot } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type View = typeof import('../../components/teams/team-view');
type TeamsIndexView = typeof import('../../components/teams/teams-index-view');
type Headlines = typeof import('../../components/teams/team-headlines');
type Line = typeof import('../../components/playoffs/team-postseason-line');
type GameViewModule = typeof import('../../components/game/game-view');

interface Loaded {
  d: Data;
  pl: Line;
  l: Leagues;
  v: View;
  ti: TeamsIndexView;
  th: Headlines;
  gm: GameViewModule;
  renderTeam: (slug: string) => Promise<string>;
  renderGame: (contestId: string) => Promise<string>;
  /** The game's cross-check sentence (GameElsewhere), rendered from its view model: no page prints it now. */
  renderElsewhere: (contestId: string) => string;
  renderIndex: () => string;
  describeTeam: (slug: string) => Promise<string | undefined>;
}

const priorEnv = process.env.SCVAL_SNAPSHOT;
let eal: Loaded;
let withTag: Loaded;
let tagged: Game;
let taggedFinal: Game;

/** CCS concepts and seed words no EAL view may carry (spec D21, D10). */
const BANNED = /\bCCS\b|at-large|automatic qualifier|\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i;

async function load(snapshotPath: string): Promise<Loaded> {
  process.env.SCVAL_SNAPSHOT = snapshotPath;
  vi.resetModules();
  const d = await import('../../lib/data');
  const pl = await import('../../components/playoffs/team-postseason-line');
  const l = await import('../../lib/leagues');
  const v = await import('../../components/teams/team-view');
  const ti = await import('../../components/teams/teams-index-view');
  const th = await import('../../components/teams/team-headlines');
  const gm = await import('../../components/game/game-view');
  const teamPage = await import('../../app/teams/[slug]/page');
  const gamePage = await import('../../app/game/[id]/page');
  const { GameElsewhere } = await import('../../components/game/GameSources');
  const indexPage = (await import('../../app/teams/page')).default;
  return {
    d,
    pl,
    l,
    v,
    ti,
    th,
    gm,
    renderTeam: async (slug) =>
      renderToStaticMarkup((await teamPage.default({ params: Promise.resolve({ slug }) } as never)) as ReactElement),
    renderGame: async (contestId) =>
      renderToStaticMarkup(
        (await gamePage.default({ params: Promise.resolve({ id: contestId }) } as never)) as ReactElement,
      ),
    renderElsewhere: (contestId) =>
      renderToStaticMarkup(createElement(GameElsewhere, { model: gm.buildGameView(contestId.replace(':', '-'))! })),
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
  // no league game is that late in the capture, so the row is given MaxPreps' playoff type (4) and the
  // tag the pipeline writes for it. The tag has to be the config's own: a snapshot whose tags differ
  // from the current config is reclassified on load (lib/snapshot/snapshot-migrate.ts needsReclassification).
  const snap = JSON.parse(readFileSync(path0, 'utf8')) as Snapshot;
  const target = snap.games.find(
    (g) => g.status === 'scheduled' && g.countsFor !== null && g.home.slug === 'chico' && g.away.slug === 'lassen',
  );
  if (!target) throw new Error('the EAL corpus has no scheduled Lassen at Chico game to tag');
  target.countsFor = null;
  target.leagueDivision = null;
  target.contestTypes = { home: 4, away: 4 };
  target.postseason = { kind: 'league-postseason', leagueId: 'eal', via: 'contest-type-4' };
  // And one counted final between two members, so a Super Regional game page has a score to cross-check.
  const final = snap.games.find((g) => g.status === 'final' && g.countsFor !== null);
  if (!final) throw new Error('the EAL corpus has no counted final to tag');
  final.countsFor = null;
  final.leagueDivision = null;
  final.contestTypes = { home: 4, away: 4 };
  final.postseason = { kind: 'league-postseason', leagueId: 'eal', via: 'contest-type-4' };
  withTag = await load(writeTempSnapshot(snap, 'eal-team-views'));
  tagged = withTag.d.getGameById(target.contestId)!;
  taggedFinal = withTag.d.getGameById(final.contestId)!;
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
    if (ps.kind !== 'unbracketed-tournament') throw new Error('lib/league-config/eal.ts: the EAL postseason is unbracketed');
    const html = await eal.renderTeam('davis');
    const text = textOf(html);
    expect(text, 'app/teams/[slug]/page.tsx kicker').toContain(`${ps.name} picture`);
    expect(text, 'app/teams/[slug]/page.tsx kicker').toContain('Super Regional picture');
    const line = eal.pl.getTeamPostseasonLine('davis');
    expect(line, 'components/playoffs/team-postseason-line.ts getTeamPostseasonLine').not.toBeNull();
    // Nothing is projected for the EAL (every team is in the six), so the card carries no "Projected" line.
    expect(line?.caveat, 'components/playoffs/team-postseason-line.ts caveat').toBeNull();
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('Projected from the table today');
    expect(text, 'components/teams/TeamPlayoffLine.tsx sentence').toContain(
      'The top six schools play the Super Regional, Oct 30–31, and every EAL team is one of the six; the NFHS Network’s CIFNS listing has the games at Pleasant Valley High School, Chico on Sat Oct 31.',
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

  it('keeps the end-of-season sentence and the no-bracket sentence in the league copy', async () => {
    const copy = eal.v.leagueCopy('eal');
    expect(copy.seasonEndSentence).toBe('The EAL league season ends Wed Oct 28; the Super Regional follows, Oct 30–31.');
    expect(copy.bracketSentence).toBe(
      'No pairings are published; we list each Super Regional game as MaxPreps posts it.',
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
    expect(eal.th.gameHeadline(decided, eal.d.getTeamBySlug('chico')!)).toMatch(/^W 1–1 .* SO$/);
    expect(eal.th.gameHeadline(decided, eal.d.getTeamBySlug('davis')!)).toMatch(/^L 1–1 .* SO$/);
  });
});

describe('the 9/28 Chico-Davis game page (decider SO, no stored tally)', () => {
  it('names Chico first, tags it (SO), and says MaxPreps marks Chico the winner and the tally is not shown', async () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    expect(game.decider, 'lib/pipeline/normalize.ts decider').toBe('SO');
    expect(game.shootout, 'DATA_QUALITY.resultCorrections: the tally on MaxPreps’ game page').toEqual({ home: 2, away: 1 });
    const model = eal.gm.buildGameView(game.contestId)!;
    const title = eal.gm.gameTitle(model);
    expect(title.startsWith('Chico 1, Davis 1 (SO)'), `components/game/game-view.ts gameTitle: ${title}`).toBe(true);
    expect(eal.gm.gameKicker(model), 'components/game/game-view.ts gameKicker').toContain('SO');
    // The tally is recorded from a cited source, so the note says where each number is from.
    expect(model.scoreNote, 'components/game/game-view.ts scoreNote').toMatch(
      /^MaxPreps’ page for the game, read Nov 14, 2026: level 1-1 at the final, shootout column Chico 2, Davis 1; .*\. This site shows the goals in play, 1–1, and the tally apart\.$/,
    );
    expect(model.resultConflictNote, 'components/game/game-view.ts: no level-score-marked-W/L note').toBeNull();
    const text = textOf(await eal.renderGame(game.contestId));
    expect(text, 'app/game/[id]/page.tsx note').toContain(model.scoreNote!);
    expect(text, 'app/game/[id]/page.tsx').not.toMatch(/counts it as a tie|level, so this site counts/);
    expect(model.display.sentence, 'components/ui/describe-game.ts sentence').toBe(
      'Chico 1, Davis 1, final; Chico won on 1 v 1s, 2–1.',
    );
  });

  it('counts it as a win in the season series', () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    const summary = eal.gm.buildGameView(game.contestId)!.series.summary;
    expect(summary, 'components/game/game-view.ts series summary').toMatch(/^Chico leads the season series 1-0\./);
    expect(summary, 'components/game/game-view.ts series summary').not.toMatch(/draw|level/);
  });

  it('gives each side its outcome chip: Chico W, Davis L', () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    const model = eal.gm.buildGameView(game.contestId)!;
    const chico = [model.home, model.away].find((s) => s.team?.slug === 'chico')!;
    const davis = [model.home, model.away].find((s) => s.team?.slug === 'davis')!;
    expect(chico.outcome, 'components/game/game-view.ts chico').toBe('W');
    expect(davis.outcome, 'components/game/game-view.ts davis').toBe('L');
  });
});

describe('the 9/2 Pleasant Valley at Chico game page (MaxPreps: 1-0 in three overtimes; recorded: 0-0, two overtimes, 1 v 1s)', () => {
  it('shows the level score, the SO tag and the citation, never MaxPreps’ three overtimes', async () => {
    const game = gameOn(eal, 'chico', 'pleasant-valley', '2026-09-02');
    expect([game.home.score, game.away.score, game.otPeriods, game.decider]).toEqual([0, 0, 2, 'SO']);
    expect(game.provenance.resultCorrection?.maxpreps).toEqual({ home: 0, away: 1, otPeriods: 3 });
    const model = eal.gm.buildGameView(game.contestId)!;
    expect(model.display.deciderTag, 'components/ui/describe-game.ts deciderTag').toBe('SO');
    expect(model.display.sentence, 'components/ui/describe-game.ts sentence').toBe(
      'Chico 0, Pleasant Valley 0, final; Pleasant Valley won on 1 v 1s.',
    );
    expect(model.scoreNote, 'components/game/game-view.ts scoreNote').toContain('double overtime and shootouts');
    const text = textOf(await eal.renderGame(game.contestId));
    expect(text, 'app/game/[id]/page.tsx: no three-overtime claim').not.toMatch(/3 overtime|\b3 OT\b/);
  });

  it('words the earlier-meeting line as a 1 v 1 loss', async () => {
    const game = gameOn(eal, 'chico', 'pleasant-valley', '2026-09-02');
    const html = await eal.renderTeam('chico');
    expect(html, 'app/teams/[slug]/page.tsx: the game is linked').toContain(`href="/game/${game.contestId}"`);
    const earlier = eal.v.earlierMeeting(
      eal.d.getTeamBySlug('chico')!,
      eal.d.getTeamBySlug('pleasant-valley')!,
      '2026-10-06',
    );
    expect(earlier?.text, 'components/teams/team-view.ts earlierMeeting').toBe('Earlier: lost 0–0 on 1 v 1s at home, Sep 2');
  });
});

describe('the cross-check paragraph (components/game/GameSources.tsx GameElsewhere, spec D23, D24)', () => {
  // DESIGN §33: the game page no longer carries a per-page method paragraph, so the sentence is rendered from
  // the component, as tests/ui/game-view.test.ts does. The wording is still GameElsewhere's, whole.
  /** The paragraph's last sentence, in the section its kicker labels. */
  function elsewhereText(html: string): string {
    const at = html.indexOf('aria-labelledby="game-sources-kicker"');
    expect(at, 'components/game/GameSources.tsx: the Elsewhere section renders').toBeGreaterThan(-1);
    return textOf(html.slice(at, html.indexOf('</section>', at)));
  }

  it('on a counted EAL final: "a league game", never "official", plus the 1 v 1 exception', async () => {
    const game = gameOn(eal, 'chico', 'davis', '2026-09-28');
    expect(game.countsFor, 'lib/classify.ts: the game counts').not.toBeNull();
    expect(eal.l.getDivision(game.countsFor!).official.mode, 'lib/league-config/eal.ts official.mode').toBe('none');
    const league = eal.l.leagueOfDivision(game.countsFor!);
    expect(league.rules.leagueOvertime, 'lib/league-config/eal.ts leagueOvertime').toBe('shootout');
    const text = elsewhereText(eal.renderElsewhere(game.contestId));
    expect(text, 'components/game/GameSources.tsx').toContain(
      'When MaxPreps has no result for a league game, or its row is clearly wrong, we publish si.com’s score and mark it;',
    );
    expect(text, 'components/game/GameSources.tsx: no official schedule (D23)').not.toMatch(/\bofficial\b/i);
    expect(text, 'components/game/GameSources.tsx: the D24 exception').toContain(
      `A level si.com score between two ${league.shortName} teams is never used: a varsity game there is decided on 1 v 1s, and si.com does not say who won them.`,
    );
  });

  it('on a final between an EAL team and a non-member: the fixture-backed wording, no 1 v 1 clause', async () => {
    const ealSlugs = new Set(eal.d.getTeams().filter((t) => t.league === 'eal').map((t) => t.slug));
    const game = eal.d
      .getGames({ status: 'final' })
      .find(
        (g) =>
          g.countsFor === null &&
          g.postseason === null &&
          [g.home.slug, g.away.slug].some((s) => s !== null && ealSlugs.has(s)) &&
          ![g.home.slug, g.away.slug].every((s) => s !== null && ealSlugs.has(s)),
      );
    expect(game, 'the EAL corpus has a non-league final of an EAL team').toBeDefined();
    const text = elsewhereText(eal.renderElsewhere(game!.contestId));
    expect(text, 'components/game/GameSources.tsx').toContain('When MaxPreps has no result for an official league game,');
    expect(text, 'components/game/GameSources.tsx: D24 needs two members').not.toContain('1 v 1s');
  });

  it('on a Super Regional final between two members: "a league game", never "official", plus the 1 v 1 exception', async () => {
    expect(taggedFinal.postseason?.kind, 'the hand-tagged corpus copy').toBe('league-postseason');
    expect(taggedFinal.countsFor, 'the hand-tagged corpus copy').toBeNull();
    const league = withTag.l.getLeague(taggedFinal.postseason!.leagueId!);
    expect(league.divisions.every((d) => d.official.mode === 'none'), 'lib/league-config/eal.ts official.mode').toBe(true);
    expect(league.rules.leagueOvertime, 'lib/league-config/eal.ts leagueOvertime').toBe('shootout');
    const text = elsewhereText(withTag.renderElsewhere(taggedFinal.contestId));
    expect(text, 'components/game/GameSources.tsx').toContain('When MaxPreps has no result for a league game,');
    expect(text, 'components/game/GameSources.tsx: no official schedule (D23)').not.toMatch(/\bofficial\b/i);
    expect(text, 'components/game/GameSources.tsx: the D24 exception').toContain(
      `A level si.com score between two ${league.shortName} teams is never used`,
    );
  });
});

describe('a Super Regional game (tag league-postseason)', () => {
  it('says it does not count in the league table, under the EAL Super Regional label', async () => {
    expect(tagged.postseason?.kind, 'the hand-tagged corpus copy').toBe('league-postseason');
    const model = withTag.gm.buildGameView(tagged.contestId)!;
    expect(model.postseasonNotes, 'components/game/game-view.ts postseasonNotes').toEqual([
      'Super Regional game — it does not count in the league table.',
    ]);
    expect(model.contextLabel, 'components/game/game-view.ts contextLabel').toBe('EAL Super Regional');
    expect(model.countsAs.label, 'components/game/game-view.ts countsAs').toBe('EAL Super Regional');
    const text = textOf(await withTag.renderGame(tagged.contestId));
    expect(text, 'app/game/[id]/page.tsx').toContain('Super Regional game — it does not count in the league table.');
    expect(text, 'app/game/[id]/page.tsx').not.toMatch(/\bCCS\b/);
    expect(withTag.gm.gameDescription(model), 'components/game/game-view.ts gameDescription').toContain(
      'an EAL Super Regional game',
    );
  });
});

describe('/teams on the EAL corpus', () => {
  it('prints the membership note under the EAL heading, and only there', () => {
    const note = eal.l.getLeague('eal').membershipNote!;
    expect(note).toBeTruthy();
    const html = eal.renderIndex();
    // The league's SectionHeader carries the id on its wrapper; the h2 is inside it (DESIGN §33: a league is a
    // section of the directory, so its heading is an h2 and the note sits right under it, before the name list).
    const header = html.search(/\sid="eal"/);
    expect(header, 'app/teams/page.tsx EAL heading').toBeGreaterThan(0);
    expect(html.slice(header, header + 400), 'app/teams/page.tsx EAL h2').toContain('<h2');
    const after = html.slice(header, header + 6000);
    expect(after.indexOf(note), 'app/teams/page.tsx membership note under the h2').toBeGreaterThanOrEqual(0);
    expect(after.indexOf(note), 'app/teams/page.tsx membership note comes before the list').toBeLessThan(
      after.indexOf('<li data-team-slug='),
    );
    expect(after.slice(0, after.indexOf(note)), 'app/teams/page.tsx note directly under the heading').not.toContain('<ul');
    expect(textOf(html).split(note).length - 1, 'app/teams/page.tsx note appears once').toBe(1);
    const groups = eal.ti.buildTeamsByLeague().flatMap((s) => s.leagues);
    // The EAL and the Sunset (a field hockey grouping, not the all-sports league of that name) carry one.
    expect(groups.filter((g) => g.membershipNote).map((g) => g.league.id), 'components/teams/teams-index-view.ts groups').toEqual(['eal', 'sunset', 'independents']);
    // Nine leagues and the LA independents' group (DESIGN §24.9).
    expect(groups.length, 'components/teams/teams-index-view.ts nine league groups and the independents').toBe(10);
  });

  it('lists the six EAL teams, keeps the alignment sentence in the view, and carries no seed word', () => {
    const html = eal.renderIndex();
    const text = textOf(html);
    // The provenance lede is /about's now (DESIGN §33); the sentence itself is still the view's.
    expect(eal.ti.alignmentSentence(), 'components/teams/teams-index-view.ts').toContain(
      'the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026.',
    );
    expect(text, 'app/teams/page.tsx: no lede under the title').not.toContain('the EAL publishes none');
    for (const team of eal.d.getTeams({ league: 'eal' })) {
      expect(html, `app/teams/page.tsx ${team.slug}`).toContain(`<li data-team-slug="${team.slug}" data-team-tile="${team.slug}"`);
    }
    expect(eal.d.getTeams({ league: 'eal' }), 'the EAL has six').toHaveLength(6);
    expect(text, 'app/teams/page.tsx').not.toMatch(/\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i);
  });
});
