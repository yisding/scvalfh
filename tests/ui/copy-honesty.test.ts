/**
 * The copy-honesty checklist (SPEC §10.9) over every league's VIEW MODELS, i.e. the values the
 * Stage C builders hand to the pages (the built HTML is checked separately by
 * scripts/assert-copy.ts):
 *
 *   components/home/home-view.ts        buildHomeView(): league panels, league cards, the 49 team views
 *   components/standings/standings-data.ts     getStandingsPageData(league) (division views built by
 *                                       components/standings/standings-view.ts)
 *   components/teams/team-view.ts       buildTeamPageView(slug), buildTeamsByLeague()
 *   components/game/game-view.ts       buildGameView(param) for every game, buildSupersededStub
 *
 * Rules (every string VALUE in the model, keys excluded):
 *  1. no "Gabilan" in any case, except the lowercase slug inside a MaxPreps URL;
 *  2. no /eliminat/i;
 *  3. in every view of a league outside the Central Coast Section (MCAL, EAL): no "automatic
 *     qualifier", "at-large", "CCS Division", "CCS picture", no BerthMeter label ("holds <n> of
 *     16"), and "CCS" only in the `CCS playoffs (SCVAL, BVAL, PCAL) →` link or as a bare tag value;
 *  4. a missing score is never "0-0": no "0-0" in the model of a game that is not final, nor in
 *     the home "next" slates;
 *  5. no division label on a single-division league ("PCAL Division", "MCAL Division",
 *     "Marin County Division", "EAL Division");
 *  6. "co-champion(s)" only once that league is past its regular phase (a config rule quoted in a
 *     builder's string, "a tie for first means co-champions", states the rule and is not checked);
 *  7. the EAL claims of scripts/copy-rules.ts (DESIGN §22.5), in every view: the umpires' grid is
 *     never official, Davis and Bella Vista are never Northern Section schools, Red Bluff is only
 *     "not fielding a varsity team in 2026", never "EAL school(s)"; and no seed word in a view of an
 *     unbracketed league (EAL), whose seeding is quoted, never applied.
 *
 * League-specific data comes from the offline corpora (SPEC §13.6: SCVAL_SNAPSHOT =
 * corpusSnapshotPath(...) before lib/data is imported), so a live fetch cannot move it. The
 * all-2026-10-02 corpus holds four leagues' data; the EAL is in it but frozen with no games of its
 * own. So a second collection runs over the EAL corpus (EAL_CORPUS, a fresh module graph): the home
 * EAL panel, card and pinned views, /standings/eal, /schedule/eal and the /playoffs EAL card as
 * rendered, the EAL team pages (view model and rendered page) and every game model, where the postseason line and kicker, the
 * 1 v 1 note, the missing banner and the membership note carry real EAL data. Every expect message
 * starts with the PRODUCING module, e.g. `components/home/home-view.ts: MCAL panel`, so the
 * orchestrator routes a failure to its owner.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  EAL_SCHOOL_CLAIM,
  RED_BLUFF_STATUS_CLAIM,
  SEED_CLAIM,
  attributeText,
  elementById,
  nonMemberSectionClaims,
  umpireOfficialClaims,
  visibleText,
} from '../../scripts/copy-rules';
import { EAL_CORPUS, corpusSnapshotPath } from '../helpers';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type Home = typeof import('../../components/home/home-view');
type Standings = typeof import('../../components/standings/standings-data');
type TeamView = typeof import('../../components/teams/team-view');
type GameView = typeof import('../../components/game/game-view');

const HV = 'components/home/home-view.ts';
const SD = 'components/standings/standings-data.ts (via components/standings/standings-view.ts)';
const TV = 'components/teams/team-view.ts';
const GV = 'components/game/game-view.ts';
const SP = 'app/schedule/[league]/page.tsx (rendered)';
const PP = 'app/playoffs/page.tsx (rendered)';
const TP = 'app/teams/[slug]/page.tsx (rendered)';

let data: Data;
let leagues: Leagues;
let home: ReturnType<Home['buildHomeView']>;
let standings: Standings;
let teamView: TeamView;
let gameView: GameView;

/** One view model under test: who produced it, which league it belongs to, the value. */
interface Subject {
  producer: string;
  label: string;
  league: string | null;
  value: unknown;
  /** The model of a game that is not final, or a slate of games still to play. */
  unplayed?: boolean;
}
let subjects: Subject[] = [];

/** The EAL corpus's collection, from its own module graph (lib/data reads SCVAL_SNAPSHOT once). */
interface EalCorpus {
  data: Data;
  leagues: Leagues;
  gameView: GameView;
  subjects: Subject[];
}
let eal: EalCorpus;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  data = await import('../../lib/data');
  leagues = await import('../../lib/leagues');
  const h = await import('../../components/home/home-view');
  standings = await import('../../components/standings/standings-data');
  teamView = await import('../../components/teams/team-view');
  gameView = await import('../../components/game/game-view');
  home = h.buildHomeView();
  markConfig(leagues.LEAGUES);
  markConfig(leagues.SECTIONS);
  markConfig(leagues.CCS);
  markSnapshot(data.getSnapshot());

  const leagueOfSlug = new Map(data.getTeams().map((t) => [t.slug, t.league]));
  const leagueOfDivision = (d: string | null | undefined) => (d ? leagues.leagueOfDivision(d).id : null);
  const s: Subject[] = [];

  for (const panel of home.panels) {
    s.push({ producer: HV, label: `${panel.shortName} panel`, league: panel.id, value: panel });
    s.push({ producer: HV, label: `${panel.shortName} panel next slate`, league: panel.id, value: panel.slate, unplayed: true });
  }
  for (const card of home.leagueCards) s.push({ producer: HV, label: `${card.shortName} league card`, league: card.id, value: card });
  for (const tv of home.teamViews) {
    const slug = tv.slug;
    s.push({ producer: HV, label: `teamViews[${slug}]`, league: leagueOfSlug.get(slug) ?? null, value: tv });
    s.push({ producer: HV, label: `teamViews[${slug}].next`, league: leagueOfSlug.get(slug) ?? null, value: tv.next, unplayed: true });
  }
  s.push({ producer: HV, label: 'status line', league: null, value: home.status });
  s.push({ producer: HV, label: 'cross-league latest', league: null, value: home.crossLeagueLatest });

  for (const id of data.getLeagueIds()) {
    const short = leagues.getLeague(id).shortName;
    s.push({ producer: SD, label: `${short} standings`, league: id, value: standings.getStandingsPageData(id) });
  }
  s.push({ producer: SD, label: 'standings overview', league: null, value: standings.getStandingsOverviewData() });

  for (const t of data.getTeams()) {
    s.push({ producer: TV, label: `team page ${t.slug}`, league: t.league, value: teamView.buildTeamPageView(t.slug) });
  }
  s.push({ producer: TV, label: 'teams index', league: null, value: teamView.buildTeamsByLeague() });

  for (const { id: param } of gameView.gameStaticParams()) {
    const model = gameView.buildGameView(param);
    if (!model) {
      const stub = gameView.buildSupersededStub(param);
      s.push({ producer: GV, label: `superseded stub ${param}`, league: null, value: stub });
      continue;
    }
    const g = model.game;
    // A game belongs to a league's views when it counts there or is that league's postseason game.
    const league = leagueOfDivision(g.countsFor) ?? g.postseason?.leagueId ?? null;
    s.push({ producer: GV, label: `game ${param}`, league, value: model, unplayed: g.status !== 'final' });
  }
  subjects = s;

  eal = await collectEal();
}, 600_000);

/**
 * The EAL corpus: a fresh module graph over corpusSnapshotPath(EAL_CORPUS), and every EAL view on
 * it. The pages with no view model of their own (/schedule/eal, the /playoffs card), and the team
 * pages (whose kicker the page composes), are rendered, and their visible text is the subject.
 */
async function collectEal(): Promise<EalCorpus> {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath(EAL_CORPUS);
  vi.resetModules();
  const d: Data = await import('../../lib/data');
  const l: Leagues = await import('../../lib/leagues');
  const h = (await import('../../components/home/home-view')).buildHomeView();
  const sd: Standings = await import('../../components/standings/standings-data');
  const tv: TeamView = await import('../../components/teams/team-view');
  const gm: GameView = await import('../../components/game/game-view');
  const schedulePage = (await import('../../app/schedule/[league]/page')).default;
  const playoffsPage = (await import('../../app/playoffs/page')).default;
  const teamPage = (await import('../../app/teams/[slug]/page')).default;
  markConfig(l.LEAGUES);
  markConfig(l.SECTIONS);
  markConfig(l.CCS);
  markSnapshot(d.getSnapshot());

  const ids = new Set(l.UNBRACKETED_LEAGUE_IDS);
  const leagueOfSlug = new Map(d.getTeams().map((t) => [t.slug, t.league]));
  const leagueOfDivision = (div: string | null | undefined) => (div ? l.leagueOfDivision(div).id : null);
  const s: Subject[] = [];
  for (const panel of h.panels.filter((p) => ids.has(p.id))) {
    s.push({ producer: HV, label: `${panel.shortName} panel (EAL corpus)`, league: panel.id, value: panel });
    s.push({ producer: HV, label: `${panel.shortName} panel next slate (EAL corpus)`, league: panel.id, value: panel.slate, unplayed: true });
  }
  for (const card of h.leagueCards.filter((c) => ids.has(c.id))) {
    s.push({ producer: HV, label: `${card.shortName} league card (EAL corpus)`, league: card.id, value: card });
  }
  for (const view of h.teamViews) {
    const league = leagueOfSlug.get(view.slug) ?? null;
    if (!league || !ids.has(league)) continue;
    s.push({ producer: HV, label: `teamViews[${view.slug}] (EAL corpus)`, league, value: view });
    s.push({ producer: HV, label: `teamViews[${view.slug}].next (EAL corpus)`, league, value: view.next, unplayed: true });
  }
  const playoffsHtml = renderToStaticMarkup(createElement(playoffsPage));
  for (const id of ids) {
    const short = l.getLeague(id).shortName;
    s.push({ producer: SD, label: `${short} standings (EAL corpus)`, league: id, value: sd.getStandingsPageData(id) });
    const params = { params: Promise.resolve({ league: id }) } as never;
    const scheduleHtml = renderToStaticMarkup((await schedulePage(params)) as ReactElement);
    s.push({ producer: SP, label: `/schedule/${id} (EAL corpus)`, league: id, value: visibleText(scheduleHtml) });
    s.push({ producer: SP, label: `/schedule/${id} attributes (EAL corpus)`, league: id, value: attributeText(scheduleHtml) });
    const card = elementById(playoffsHtml, id, 'div');
    s.push({ producer: PP, label: `/playoffs #${id} card (EAL corpus)`, league: id, value: visibleText(card) });
    s.push({ producer: PP, label: `/playoffs #${id} card attributes (EAL corpus)`, league: id, value: attributeText(card) });
  }
  for (const t of d.getTeams().filter((x) => ids.has(x.league))) {
    s.push({ producer: TV, label: `team page ${t.slug} (EAL corpus)`, league: t.league, value: tv.buildTeamPageView(t.slug) });
    // The page itself too: its kicker and postseason line are composed there, not in the view.
    const params = { params: Promise.resolve({ slug: t.slug }) } as never;
    const html = renderToStaticMarkup((await teamPage(params)) as ReactElement);
    s.push({ producer: TP, label: `/teams/${t.slug} (EAL corpus)`, league: t.league, value: visibleText(html) });
    s.push({ producer: TP, label: `/teams/${t.slug} attributes (EAL corpus)`, league: t.league, value: attributeText(html) });
  }
  for (const { id: param } of gm.gameStaticParams()) {
    const model = gm.buildGameView(param);
    if (!model) {
      s.push({ producer: GV, label: `superseded stub ${param} (EAL corpus)`, league: null, value: gm.buildSupersededStub(param) });
      continue;
    }
    const g = model.game;
    const league = leagueOfDivision(g.countsFor) ?? g.postseason?.leagueId ?? null;
    s.push({ producer: GV, label: `game ${param} (EAL corpus)`, league, value: model, unplayed: g.status !== 'final' });
  }
  return { data: d, leagues: l, gameView: gm, subjects: s };
}

// ---------------------------------------------------------------- string walking

/**
 * Every object reachable from the league config (lib/leagues.ts). A view model that embeds a
 * config object BY REFERENCE (e.g. `model.league.rules`) carries config, not copy the builder
 * wrote; config strings are tests/leagues.test.ts's business, so the walk skips them.
 */
const configObjects = new Set<unknown>();
function markConfig(value: unknown): void {
  if (!value || typeof value !== 'object' || configObjects.has(value)) return;
  configObjects.add(value);
  for (const v of Object.values(value)) markConfig(v);
}

/**
 * Every object reachable from the snapshot (raw games, standings, teams). The never-0-0 rule is
 * about what a builder WRITES for a game with no score; raw snapshot strings such as a standing's
 * MaxPreps comparison (`league goals 0-6 vs MaxPreps 0-0`, goal totals) are data, not a score
 * line, so that one rule skips them. The other rules read them too.
 */
const snapshotObjects = new Set<unknown>();
function markSnapshot(value: unknown): void {
  if (!value || typeof value !== 'object' || snapshotObjects.has(value)) return;
  snapshotObjects.add(value);
  for (const v of Object.values(value)) markSnapshot(v);
}

/** Every string value in a model with its path (object keys are never checked). */
function strings(
  value: unknown,
  opts: { skipSnapshot?: boolean } = {},
  at = '$',
  out: Array<[string, string]> = [],
  seen = new Set<unknown>(),
): Array<[string, string]> {
  if (typeof value === 'string') out.push([at, value]);
  else if (value && typeof value === 'object') {
    if (seen.has(value) || configObjects.has(value)) return out;
    if (opts.skipSnapshot && snapshotObjects.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) value.forEach((v, i) => strings(v, opts, `${at}[${i}]`, out, seen));
    else for (const [k, v] of Object.entries(value)) strings(v, opts, `${at}.${k}`, out, seen);
  }
  return out;
}
const isUrl = (s: string) => /^(https?:)?\/\//.test(s) || s.startsWith('/');
const isMaxprepsUrl = (s: string) => /^https?:\/\/(www\.)?maxpreps\.com\//.test(s);

/** The offending (path, value) pairs of one subject for one rule. */
function offenders(subject: Subject, test: (s: string) => boolean, opts: { skipSnapshot?: boolean } = {}): string[] {
  return strings(subject.value, opts)
    .filter(([, v]) => test(v))
    .map(([p, v]) => `${p} = ${JSON.stringify(v.length > 160 ? `${v.slice(0, 160)}…` : v)}`);
}

function expectNone(subject: Subject, rule: string, test: (s: string) => boolean, opts: { skipSnapshot?: boolean } = {}): void {
  expect(offenders(subject, test, opts), `${subject.producer}: ${subject.label} — ${rule}`).toEqual([]);
}

/**
 * The league rules' citations that mention co-champions (lib/leagues.ts `rules.citations`, e.g. the
 * EAL's "a tie for first means co-champions (§VII.C)"). A builder that quotes one in a footnote
 * states the rule; the co-champion rule is about declaring them, so these are taken out of a value
 * before it is read. Citations only: a label such as `coChampionsLabel` ('EAL co-champions') is what
 * a declaration prints, so it is never taken out.
 */
function coChampionConfigText(...configs: Leagues[]): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (/co-champion/i.test(value)) out.add(value);
    } else if (value && typeof value === 'object') for (const v of Object.values(value)) walk(v);
  };
  for (const l of configs) for (const league of l.LEAGUES) walk(league.rules.citations);
  // Longest first, so a string that contains another is taken out whole.
  return [...out].sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------- the checklist

describe('copy honesty over every league’s view models (SPEC §10.9)', () => {
  /** Both collections: the all-2026-10-02 corpus and the EAL corpus. */
  const all = () => [...subjects, ...eal.subjects];
  const nonCcs = () =>
    new Set([...leagues.LEAGUES, ...eal.leagues.LEAGUES].filter((l) => l.sectionId !== 'ccs').map((l) => l.id));

  it('collects view models for all five leagues from every producer', () => {
    expect(data.getLeagueIds().length, 'lib/data.ts: league ids').toBe(leagues.LEAGUES.length);
    for (const id of data.getLeagueIds()) {
      for (const producer of [HV, SD, TV]) {
        expect(subjects.some((s) => s.producer === producer && s.league === id), `${producer}: no view model for ${id}`).toBe(true);
      }
    }
    expect(subjects.filter((s) => s.producer === GV).length, `${GV}: game models`).toBe(gameView.gameStaticParams().length);
  });

  it('collects the EAL views on the EAL corpus, where the EAL has data', () => {
    const ids = eal.leagues.UNBRACKETED_LEAGUE_IDS;
    expect(ids.length, 'lib/leagues.ts: unbracketed leagues').toBeGreaterThan(0);
    for (const id of ids) {
      for (const producer of [HV, SD, TV, SP, PP, TP]) {
        expect(eal.subjects.some((s) => s.producer === producer && s.league === id), `${producer}: no ${id} view on the EAL corpus`).toBe(true);
      }
      const teams = eal.data.getTeams().filter((t) => t.league === id).length;
      expect(eal.subjects.filter((s) => s.producer === TV && s.league === id).length, `${TV}: ${id} team pages`).toBe(teams);
      expect(eal.subjects.filter((s) => s.producer === HV && s.league === id && s.label.startsWith('teamViews[') && !s.unplayed).length,
        `${HV}: ${id} pinned views`).toBe(teams);
      // The EAL corpus has finals counted, so the views carry real copy (not empty states).
      expect(eal.data.getGames().filter((g) => g.countsFor && eal.leagues.leagueOfDivision(g.countsFor).id === id && g.status === 'final').length,
        `${id}: counted league finals on the EAL corpus`).toBeGreaterThan(0);
    }
    expect(eal.subjects.filter((s) => s.producer === GV).length, `${GV}: game models (EAL corpus)`).toBe(eal.gameView.gameStaticParams().length);
    // The copy the second pass exists for is there to be checked: the Super Regional kicker, the
    // 1 v 1 note, the missing banner and the membership note.
    const text = eal.subjects.flatMap((s) => strings(s.value).map(([, v]) => v)).join('\n');
    const ps = eal.leagues.getLeague(ids[0]).postseason;
    expect(ps.kind, 'lib/leagues.ts: postseason kind').toBe('unbracketed-tournament');
    if (ps.kind === 'unbracketed-tournament') expect(text, `${TP}: "${ps.name} picture" kicker`).toContain(`${ps.name} picture`);
    expect(text, `${GV}: the 1 v 1 note`).toMatch(/1 v 1s decided it/);
    expect(text, `${SD}: the missing banner`).toMatch(/league results? missing/);
    expect(text, `${SP}: membership note`).toContain(eal.leagues.getLeague(ids[0]).membershipNote ?? '(none)');
  });

  it('"Gabilan" never appears (only the lowercase slug inside a MaxPreps URL)', () => {
    for (const s of all()) expectNone(s, 'contains "Gabilan"', (v) => /gabilan/i.test(v) && !(isMaxprepsUrl(v) && !/Gabilan/.test(v)));
  });

  it('"eliminated" never appears', () => {
    for (const s of all()) expectNone(s, 'contains "eliminat…"', (v) => /eliminat/i.test(v));
  });

  it('non-CCS views carry no CCS concept', () => {
    const ids = nonCcs();
    const allowed = 'CCS playoffs (SCVAL, BVAL, PCAL) →';
    const views = all().filter((s) => s.league && ids.has(s.league));
    expect(views.length, `${HV}: no non-CCS view models collected`).toBeGreaterThan(10);
    expect(eal.subjects.filter((s) => s.league && ids.has(s.league)).length, `${HV}: no EAL-corpus view models collected`).toBeGreaterThan(10);
    // Control: the same walk DOES see CCS copy in a CCS league's panel, so a pass below is real.
    const ccsPanel = subjects.find((s) => s.producer === HV && s.league && !ids.has(s.league) && s.label.endsWith(' panel'));
    expect(ccsPanel && offenders(ccsPanel, (v) => /\bCCS\b/.test(v)).length, `${HV}: a CCS panel names CCS`).toBeGreaterThan(0);
    for (const s of views) {
      expectNone(s, 'says "automatic qualifier"', (v) => !isUrl(v) && /automatic qualifier/i.test(v));
      expectNone(s, 'says "at-large"', (v) => !isUrl(v) && /at-large/i.test(v));
      expectNone(s, 'says "CCS Division"', (v) => !isUrl(v) && /CCS Division/i.test(v));
      expectNone(s, 'says "CCS picture"', (v) => !isUrl(v) && /CCS picture/i.test(v));
      expectNone(s, 'carries a CCS berth-meter label', (v) => !isUrl(v) && /holds \d+ of 16/i.test(v));
      expectNone(s, `names CCS outside "${allowed}"`, (v) => !isUrl(v) && v !== 'CCS' && /\bCCS\b/.test(v.split(allowed).join('')));
    }
  });

  it('a missing score never renders as 0-0', () => {
    const zeroZero = /(^|[^\w-])0\s*[-–]\s*0($|[^\w-])/;
    const unplayed = all().filter((s) => s.unplayed);
    expect(unplayed.length, `${GV}: no unplayed games or slates collected`).toBeGreaterThan(0);
    expect(eal.subjects.some((s) => s.unplayed && s.producer === GV), `${GV}: no unplayed EAL-corpus games collected`).toBe(true);
    for (const s of unplayed) expectNone(s, 'shows 0-0 for a game with no score', (v) => !isUrl(v) && zeroZero.test(v), { skipSnapshot: true });
  });

  it('no division label on a single-division league', () => {
    const banned: string[] = [];
    for (const l of leagues.LEAGUES) {
      if (!leagues.isSingleDivision(l.id)) continue;
      banned.push(`${l.shortName} Division`, ...l.divisions.map((d) => `${leagues.divisionLabel(d.id)} Division`));
    }
    expect(banned, 'lib/leagues.ts: single-division leagues').toEqual(
      expect.arrayContaining(['PCAL Division', 'MCAL Division', 'EAL Division']),
    );
    for (const s of all()) {
      expectNone(s, `labels a single-division league as a division (${banned.join(', ')})`, (v) => banned.some((b) => v.includes(b)));
    }
  });

  it('"co-champions" appears only after the league’s regular phase', () => {
    const quoted = coChampionConfigText(leagues, eal.leagues);
    expect(quoted.length, 'lib/leagues.ts: co-champion rules').toBeGreaterThan(0);
    const unquoted = (v: string) => quoted.reduce((rest, q) => rest.split(q).join(' '), v);
    for (const [corpus, d] of [[subjects, data], [eal.subjects, eal.data]] as const) {
      for (const id of d.getLeagueIds()) {
        const phase = d.getSeasonPhase(id);
        if (phase !== 'preseason' && phase !== 'regular') continue;
        for (const s of corpus.filter((x) => x.league === id)) {
          expectNone(s, `says "co-champion" while ${id} is in its ${phase} phase`, (v) => !isUrl(v) && /co-champion/i.test(unquoted(v)));
        }
      }
    }
  });

  it('the EAL claims: the umpires’ grid is never official, Davis and Bella Vista are not Northern Section schools, Red Bluff is not cancelled, no "EAL school"', () => {
    for (const s of all()) {
      expectNone(s, 'calls the umpires’ grid official', (v) => !isUrl(v) && umpireOfficialClaims(v).length > 0);
      expectNone(s, 'calls Davis or Bella Vista a Northern Section school', (v) => !isUrl(v) && nonMemberSectionClaims(v).length > 0);
      expectNone(s, 'says more about Red Bluff than "not fielding a varsity team in 2026"', (v) => !isUrl(v) && RED_BLUFF_STATUS_CLAIM.test(v));
      expectNone(s, 'says "EAL school(s)" or "EAL member(s)"', (v) => !isUrl(v) && EAL_SCHOOL_CLAIM.test(v));
    }
  });

  it('no seed word in an unbracketed league’s views (its seeding is quoted, never applied)', () => {
    const ids = new Set([...leagues.UNBRACKETED_LEAGUE_IDS, ...eal.leagues.UNBRACKETED_LEAGUE_IDS]);
    const views = all().filter((s) => s.league && ids.has(s.league));
    expect(views.length, `${HV}: no unbracketed-league views collected`).toBeGreaterThan(10);
    for (const s of views) expectNone(s, 'prints a seed word', (v) => !isUrl(v) && SEED_CLAIM.test(v));
  });
});
