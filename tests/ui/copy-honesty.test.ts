/**
 * The copy-honesty checklist (SPEC §10.9) over every league's VIEW MODELS, i.e. the values the
 * Stage C builders hand to the pages (the built HTML is checked separately by
 * scripts/assert-copy.ts):
 *
 *   components/home/home-data.ts        getHomeData(): league panels, league cards, the 43 team views
 *   app/standings/standings-data.ts     getStandingsPageData(league) (division views built by
 *                                       components/standings/standings-view.ts)
 *   components/teams/team-view.ts       buildTeamPageView(slug), buildTeamsByLeague()
 *   components/game/game-model.ts       buildGameModel(param) for every game, buildSupersededStub
 *
 * Rules (every string VALUE in the model, keys excluded):
 *  1. no "Gabilan" in any case, except the lowercase slug inside a MaxPreps URL;
 *  2. no /eliminat/i;
 *  3. in every MCAL (NCS) view: no "automatic qualifier", "at-large", "CCS Division", "CCS picture",
 *     no BerthMeter label ("holds <n> of 16"), and "CCS" only in the
 *     `CCS playoffs (SCVAL, BVAL, PCAL) →` link or as a bare tag value;
 *  4. a missing score is never "0-0": no "0-0" in the model of a game that is not final, nor in
 *     the home "next" slates;
 *  5. no division label on a single-division league ("PCAL Division", "MCAL Division",
 *     "Marin County Division");
 *  6. "co-champion(s)" only once that league is past its regular phase.
 *
 * League-specific data comes from the offline corpus (SPEC §13.6: SCVAL_SNAPSHOT =
 * corpusSnapshotPath('all-2026-10-02') before lib/data is imported), so a live fetch cannot move
 * it. Every expect message starts with the PRODUCING module, e.g.
 * `components/home/home-data.ts: MCAL panel`, so the orchestrator routes a failure to its owner.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type Home = typeof import('../../components/home/home-data');
type Standings = typeof import('../../app/standings/standings-data');
type TeamView = typeof import('../../components/teams/team-view');
type GameModel = typeof import('../../components/game/game-model');

const HD = 'components/home/home-data.ts';
const SD = 'app/standings/standings-data.ts (via components/standings/standings-view.ts)';
const TV = 'components/teams/team-view.ts';
const GM = 'components/game/game-model.ts';

let data: Data;
let leagues: Leagues;
let home: ReturnType<Home['getHomeData']>;
let standings: Standings;
let teamView: TeamView;
let gameModel: GameModel;

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

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  data = await import('../../lib/data');
  leagues = await import('../../lib/leagues');
  const h = await import('../../components/home/home-data');
  standings = await import('../../app/standings/standings-data');
  teamView = await import('../../components/teams/team-view');
  gameModel = await import('../../components/game/game-model');
  home = h.getHomeData();
  markConfig(leagues.LEAGUES);
  markConfig(leagues.SECTIONS);
  markConfig(leagues.CCS);
  markSnapshot(data.getSnapshot());

  const leagueOfSlug = new Map(data.getTeams().map((t) => [t.slug, t.league]));
  const leagueOfDivision = (d: string | null | undefined) => (d ? leagues.leagueOfDivision(d).id : null);
  const s: Subject[] = [];

  for (const panel of home.panels) {
    s.push({ producer: HD, label: `${panel.shortName} panel`, league: panel.id, value: panel });
    s.push({ producer: HD, label: `${panel.shortName} panel next slate`, league: panel.id, value: panel.slate, unplayed: true });
  }
  for (const card of home.leagueCards) s.push({ producer: HD, label: `${card.shortName} league card`, league: card.id, value: card });
  for (const tv of home.teamViews) {
    const slug = tv.slug;
    s.push({ producer: HD, label: `teamViews[${slug}]`, league: leagueOfSlug.get(slug) ?? null, value: tv });
    s.push({ producer: HD, label: `teamViews[${slug}].next`, league: leagueOfSlug.get(slug) ?? null, value: tv.next, unplayed: true });
  }
  s.push({ producer: HD, label: 'status line', league: null, value: home.status });
  s.push({ producer: HD, label: 'cross-league latest', league: null, value: home.crossLeagueLatest });

  for (const id of data.getLeagueIds()) {
    const short = leagues.getLeague(id).shortName;
    s.push({ producer: SD, label: `${short} standings`, league: id, value: standings.getStandingsPageData(id) });
  }
  s.push({ producer: SD, label: 'standings overview', league: null, value: standings.getStandingsOverviewData() });

  for (const t of data.getTeams()) {
    s.push({ producer: TV, label: `team page ${t.slug}`, league: t.league, value: teamView.buildTeamPageView(t.slug) });
  }
  s.push({ producer: TV, label: 'teams index', league: null, value: teamView.buildTeamsByLeague() });

  for (const { id: param } of gameModel.gameStaticParams()) {
    const model = gameModel.buildGameModel(param);
    if (!model) {
      const stub = gameModel.buildSupersededStub(param);
      s.push({ producer: GM, label: `superseded stub ${param}`, league: null, value: stub });
      continue;
    }
    const g = model.game;
    // A game belongs to a league's views when it counts there or is that league's postseason game.
    const league = leagueOfDivision(g.countsFor) ?? g.postseason?.leagueId ?? null;
    s.push({ producer: GM, label: `game ${param}`, league, value: model, unplayed: g.status !== 'final' });
  }
  subjects = s;
}, 600_000);

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

// ---------------------------------------------------------------- the checklist

describe('copy honesty over every league’s view models (SPEC §10.9)', () => {
  it('collects view models for all four leagues from every producer', () => {
    for (const id of data.getLeagueIds()) {
      for (const producer of [HD, SD, TV]) {
        expect(subjects.some((s) => s.producer === producer && s.league === id), `${producer}: no view model for ${id}`).toBe(true);
      }
    }
    expect(subjects.filter((s) => s.producer === GM).length, `${GM}: game models`).toBe(gameModel.gameStaticParams().length);
  });

  it('"Gabilan" never appears (only the lowercase slug inside a MaxPreps URL)', () => {
    for (const s of subjects) expectNone(s, 'contains "Gabilan"', (v) => /gabilan/i.test(v) && !(isMaxprepsUrl(v) && !/Gabilan/.test(v)));
  });

  it('"eliminated" never appears', () => {
    for (const s of subjects) expectNone(s, 'contains "eliminat…"', (v) => /eliminat/i.test(v));
  });

  it('MCAL views carry no CCS concept', () => {
    const ncs = new Set(leagues.LEAGUES.filter((l) => l.sectionId === 'ncs').map((l) => l.id));
    const allowed = 'CCS playoffs (SCVAL, BVAL, PCAL) →';
    const mcal = subjects.filter((s) => s.league && ncs.has(s.league));
    expect(mcal.length, `${HD}: no NCS view models collected`).toBeGreaterThan(10);
    // Control: the same walk DOES see CCS copy in a CCS league's panel, so a pass below is real.
    const ccsPanel = subjects.find((s) => s.producer === HD && s.league && !ncs.has(s.league) && s.label.endsWith(' panel'));
    expect(ccsPanel && offenders(ccsPanel, (v) => /\bCCS\b/.test(v)).length, `${HD}: a CCS panel names CCS`).toBeGreaterThan(0);
    for (const s of mcal) {
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
    const unplayed = subjects.filter((s) => s.unplayed);
    expect(unplayed.length, `${GM}: no unplayed games or slates collected`).toBeGreaterThan(0);
    for (const s of unplayed) expectNone(s, 'shows 0-0 for a game with no score', (v) => !isUrl(v) && zeroZero.test(v), { skipSnapshot: true });
  });

  it('no division label on a single-division league', () => {
    const banned: string[] = [];
    for (const l of leagues.LEAGUES) {
      if (!leagues.isSingleDivision(l.id)) continue;
      banned.push(`${l.shortName} Division`, ...l.divisions.map((d) => `${leagues.divisionLabel(d.id)} Division`));
    }
    expect(banned, 'lib/leagues.ts: single-division leagues').toEqual(expect.arrayContaining(['PCAL Division', 'MCAL Division']));
    for (const s of subjects) {
      expectNone(s, `labels a single-division league as a division (${banned.join(', ')})`, (v) => banned.some((b) => v.includes(b)));
    }
  });

  it('"co-champions" appears only after the league’s regular phase', () => {
    for (const id of data.getLeagueIds()) {
      const phase = data.getSeasonPhase(id);
      if (phase !== 'preseason' && phase !== 'regular') continue;
      for (const s of subjects.filter((x) => x.league === id)) {
        expectNone(s, `says "co-champion" while ${id} is in its ${phase} phase`, (v) => !isUrl(v) && /co-champion/i.test(v));
      }
    }
  });
});
