/**
 * The league-tournament view (SPEC §6.2, §10.7 `/playoffs/<league>`; MCAL):
 * `buildTournamentView` in components/playoffs/playoff-view.ts over the ENGINE's output
 * (lib/standings computeStandings → lib/postseason buildLeagueTournament), and the rendered page.
 *
 * The synthetic seasons run through the real standings engine, so the shared 6th the table shows
 * (`resolvedBy: 'play-in'`) and the play-in pair the bracket uses are the engine's own, not a
 * hand-built fixture. The rendered page runs on the all-2026-10-02 CORPUS snapshot (SPEC §13.6).
 * Every assertion message names the module that produced the value.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildTournamentView, type TournamentView } from '../../components/playoffs/playoff-view';
import { getDivision, getLeague } from '../../lib/leagues';
import { buildLeagueTournament, SHOOTOUT_NOTE } from '../../lib/postseason';
import { computeStandings, outcomesFor, playoffOutcomeLabel } from '../../lib/standings';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueTournamentProjection, PostseasonTag, SeasonPhase, Standing, Team } from '../../lib/types';
import { game } from '../game-builder';
import { corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

const VIEW = 'components/playoffs/playoff-view.ts';
const PAGE = 'app/playoffs/[league]/page.tsx';
const OG = 'app/playoffs/[league]/opengraph-image.tsx';

const MCAL = getLeague('mcal');
const DIV = 'marin-county';

const AW = 'archie-williams', RW = 'redwood', TM = 'tamalpais', BK = 'berkeley', LW = 'lick-wilmerding';
const UN = 'university-sf', MC = 'marin-catholic', CS = 'convent-sacred-heart', MA = 'marin-academy';

const team = (slug: string): Team => {
  const t = getTeamBySlug(slug);
  if (!t) throw new Error(`no team ${slug}`);
  return t;
};
const short = (slug: string) => team(slug).shortName;
const name = (slug: string) => team(slug).name;

type Spec = [home: string, away: string, hs: number | null, as: number | null];

let day = 0;
/** League games on distinct September/October dates (all before the Oct 23 postseason window). */
function league(specs: readonly Spec[]): Game[] {
  return specs.map(([home, away, hs, as]) => {
    day += 1;
    const date = new Date(Date.UTC(2026, 8, 1 + (day % 45))).toISOString().slice(0, 10);
    return hs === null || as === null ? game({ home, away, date }) : game({ home, away, hs, as, date });
  });
}

const TAG: PostseasonTag = { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' };
function tournament(home: string, away: string, hs: number, as: number, date: string): Game {
  return game({ home, away, hs, as, date, league: false, official: null, postseason: TAG });
}

/** Five clear leaders AW, RW, TM, BK, LW (places 1-5); MA and CSH lose to all of them. */
const TOP: Spec[] = [
  [AW, RW, 1, 0], [AW, TM, 1, 0], [AW, BK, 1, 0], [AW, LW, 1, 0],
  [RW, TM, 1, 0], [RW, BK, 1, 0], [RW, LW, 1, 0],
  [TM, BK, 1, 0], [TM, LW, 1, 0],
  [BK, LW, 1, 0],
  ...[AW, RW, TM, BK, LW].flatMap((t): Spec[] => [[t, MA, 2, 0], [MA, t, 0, 2], [t, CS, 1, 0]]),
];

function view(games: readonly Game[], phase: SeasonPhase = 'regular'): { v: TournamentView; p: LeagueTournamentProjection; rows: Standing[] } {
  const rows = computeStandings(games)
    .filter((r) => r.division === DIV)
    .sort((a, b) => a.computed.place - b.computed.place || a.slug.localeCompare(b.slug));
  const p = buildLeagueTournament(MCAL, rows, games, phase, '2026-10-02T15:00:00.000Z');
  const ps = MCAL.postseason;
  if (ps.kind !== 'league-tournament') throw new Error('MCAL has no tournament');
  const v = buildTournamentView({
    projection: p,
    rows: rows.map((standing) => ({
      team: team(standing.slug),
      standing,
      counted: standing.computed.gp,
      scheduled: getDivision(DIV).gamesPerTeam,
      label: playoffOutcomeLabel(DIV, outcomesFor(standing)),
    })),
    teamOf: (slug) => getTeamBySlug(slug),
    lastPlace: ps.lastSpot.place,
    ladderLine: getDivision(DIV).ladderLine,
  });
  return { v, p, rows };
}

const lines = (v: TournamentView) => v.rounds.flatMap((r) => r.games.map((g) => g.line));

describe('buildTournamentView — the engine’s shared 6th (a play-in is needed)', () => {
  // University and Marin Catholic split 1W-1T: level on 4 points, neither swept → play-in.
  const games = league([...TOP, [UN, MC, 2, 1], [MC, UN, 1, 1], [MC, CS, 1, 0]]);
  const { v, p, rows } = view(games);

  it('seeds from the table with the shared 6th level and the tournament line after both', () => {
    const shared = rows.filter((r) => r.tiebreak.resolvedBy === 'play-in').map((r) => r.slug).sort();
    expect(shared, 'lib/standings.ts: the engine shares 6th by play-in').toEqual([MC, UN].sort());
    expect(p.playInNeeded, 'lib/postseason.ts').toBe('yes');
    expect(v.seedRows.map((r) => `${r.standing.computed.place}${r.shared ? '=' : ''}`), VIEW).toEqual([
      '1', '2', '3', '4', '5', '6=', '6=', '8', '9',
    ]);
    expect(v.lineAfter, VIEW).toBe(7);
    expect(v.lineLabel, VIEW).toBe('Tournament line');
    expect(v.seedsMeta, VIEW).toBe('If the season ended today');
    const sixth = v.seedRows.filter((r) => r.shared);
    expect(sixth.every((r) => r.label === 'MCAL tournament or below the tournament line — a play-in on Fri Oct 23 decides it (MCAL Tie-Breaking Criteria)'), VIEW).toBe(true);
    expect(v.seedRows[0].gpText, VIEW).toMatch(/^\d+\/16 GP$/);
    expect(v.seedRows[0].ptsText, VIEW).toMatch(/^\d+ pts$/);
    expect(v.notes.some((n) => n.startsWith(`${name(MC)}: `) || n.startsWith(`${name(UN)}: `)), VIEW).toBe(true);
  });

  it('spells the play-in out, hosted by the higher draw number (Marin Catholic, 7)', () => {
    expect(v.playInSentence, VIEW).toBe(
      `A play-in for 6th is needed: ${name(MC)} and ${name(UN)} are level on points and neither won both meetings. ${name(MC)} hosts.`,
    );
    expect(v.playIn, VIEW).not.toBeNull();
    expect(v.playIn!.dateLabel, VIEW).toBe('Fri Oct 23');
    expect(v.playIn!.timeLabel, VIEW).toBe('4 PM PT');
    expect(v.playIn!.line, VIEW).toBe(`6 ${short(UN)} at 6 ${short(MC)}`);
  });

  it('builds vertical rounds with their dates; unresolved slots are named, never blank', () => {
    expect(v.rounds.map((r) => `${r.title} · ${r.meta}`), VIEW).toEqual([
      'Quarterfinals · Mon Oct 26',
      'Semifinals · Wed Oct 28',
      'Final · Fri Oct 30 · at Tamalpais',
    ]);
    expect(lines(v), VIEW).toEqual([
      `5 ${short(LW)} at 4 ${short(BK)}`,
      `6 Play-in winner (${short(MC)} or ${short(UN)}) at 3 ${short(TM)}`,
      `Lowest-ranked remaining seed at 1 ${short(AW)}`,
      `Highest-ranked remaining seed of 3-6 at 2 ${short(RW)}`,
      'Semifinal 1 winner vs Semifinal 2 winner',
    ]);
    for (const g of v.rounds.flatMap((r) => r.games)) {
      expect(g.home.text.trim().length > 0 && g.away.text.trim().length > 0, `${VIEW}: ${g.id}`).toBe(true);
    }
  });
});

describe('buildTournamentView — a play-in that is only possible', () => {
  it('says so in the verbatim words while a meeting is unplayed', () => {
    // University beat Marin Catholic once; the return meeting is unplayed. Marin Catholic beat CSH.
    const { v, p } = view(league([...TOP, [UN, MC, 1, 0], [MC, UN, null, null], [MC, CS, 1, 0]]));
    expect(p.playInNeeded, 'lib/postseason.ts').toBe('possible');
    expect(v.playInSentence, VIEW).toBe(
      `A play-in for 6th is possible: ${name(MC)} and ${name(UN)} are level on points and have split or not finished their meetings.`,
    );
    expect(v.playIn, VIEW).not.toBeNull();
  });

  it('no play-in when one team swept the other 2-0, and the engine’s note says why', () => {
    const { v, p } = view(league([...TOP, [UN, MC, 1, 0], [MC, UN, 0, 1], [MC, CS, 1, 0], [CS, MC, 0, 1]]));
    expect(p.playInNeeded, 'lib/postseason.ts').toBe('no');
    expect(v.playIn, VIEW).toBeNull();
    expect(v.playInSentence, VIEW).toBeNull();
    expect(v.notes, VIEW).toContain(`${name(UN)} won both meetings with ${name(MC)}, so no play-in is needed.`);
  });
});

describe('buildTournamentView — results re-seed the semifinals; the final is at Tamalpais', () => {
  const season = league([...TOP, [UN, MC, 2, 1], [MC, UN, 1, 1], [MC, CS, 1, 0]]);
  const playIn = tournament(MC, UN, 1, 2, '2026-10-23');
  const qfs = [tournament(BK, LW, 0, 2, '2026-10-26'), tournament(TM, UN, 3, 0, '2026-10-26')];
  const sfs = [tournament(AW, LW, 2, 0, '2026-10-28'), tournament(RW, TM, 0, 1, '2026-10-28')];
  const fin = tournament(TM, AW, 2, 1, '2026-10-30');

  it('the play-in result fills the 6th seed and carries the shootout caveat', () => {
    const { v } = view([...season, playIn], 'tournament');
    expect(v.status, VIEW).toBe('in-progress');
    expect(v.seedsMeta, VIEW).toBeNull();
    expect(v.playIn!.game?.contestId, VIEW).toBe(playIn.contestId);
    expect(v.playIn!.note, VIEW).toBe(SHOOTOUT_NOTE);
    expect(lines(v)[1], VIEW).toBe(`6 ${short(UN)} at 3 ${short(TM)}`);
  });

  it('once both quarterfinals are decided: the lowest-ranked winner plays at 1, the other at 2', () => {
    // #5 Lick-Wilmerding upsets #4 Berkeley; #3 Tamalpais beats #6 University.
    const { v } = view([...season, playIn, ...qfs], 'tournament');
    expect(lines(v).slice(2, 4), VIEW).toEqual([`5 ${short(LW)} at 1 ${short(AW)}`, `3 ${short(TM)} at 2 ${short(RW)}`]);
  });

  it('the final is listed better seed first, vs, at Tamalpais; its result completes the tournament', () => {
    let { v } = view([...season, playIn, ...qfs, ...sfs], 'tournament');
    expect(lines(v)[4], VIEW).toBe(`1 ${short(AW)} vs 3 ${short(TM)}`);
    const final = v.rounds.find((r) => r.round === 'final')!;
    expect(final.meta, VIEW).toBe('Fri Oct 30 · at Tamalpais');
    expect(final.games[0].site, VIEW).toBe('Tamalpais');
    expect(final.games[0].connector, VIEW).toBe('vs');

    ({ v } = view([...season, playIn, ...qfs, ...sfs, fin], 'complete'));
    expect(v.status, VIEW).toBe('complete');
    expect(v.rounds.find((r) => r.round === 'final')!.games[0].game?.contestId, VIEW).toBe(fin.contestId);
    expect(v.rounds.find((r) => r.round === 'final')!.games[0].note, VIEW).toBe(SHOOTOUT_NOTE);
  });

  it('a seat nobody holds yet reads TBD (preseason: no results at all)', () => {
    const { v } = view([]);
    expect(lines(v).slice(0, 2), VIEW).toEqual(['5 TBD at 4 TBD', '6 TBD at 3 TBD']);
    expect(v.seedRows.every((r) => r.label === 'No results reported' && r.ptsText === '—'), VIEW).toBe(true);
    expect(v.lineAfter, VIEW).toBe(0);
  });
});

// ---------------------------------------------------------------- the rendered page (corpus)

describe('/playoffs/mcal (rendered on the corpus snapshot)', () => {
  const priorEnv = process.env.SCVAL_SNAPSHOT;
  let html = '';
  let page: typeof import('../../app/playoffs/[league]/page');
  let og: typeof import('../../app/playoffs/[league]/opengraph-image');

  beforeAll(async () => {
    process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
    vi.resetModules();
    page = await import('../../app/playoffs/[league]/page');
    og = await import('../../app/playoffs/[league]/opengraph-image');
    const el = await page.default({ params: Promise.resolve({ league: 'mcal' }) } as never);
    html = renderToStaticMarkup(el as ReactElement);
  }, 600_000);

  afterAll(() => {
    if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = priorEnv;
    vi.resetModules();
  });

  const text = () => textOf(html);

  it('generates only the tournament leagues, for the page and its OG image alike', () => {
    expect(page.generateStaticParams(), PAGE).toEqual([{ league: 'mcal' }]);
    expect(og.generateStaticParams(), OG).toEqual(page.generateStaticParams());
    expect(page.dynamicParams, PAGE).toBe(false);
  });

  it('shows the header, the NCS note, seeds 1-6 with the tournament line and the bracket', () => {
    const t = text();
    expect(t, PAGE).toContain('MCAL tournament');
    expect(t, PAGE).toContain('Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30');
    expect(t, PAGE).toContain('CCS playoffs (SCVAL, BVAL, PCAL) →');
    expect(t, PAGE).toContain('Not a section playoff');
    expect(t, PAGE).toContain('North Coast Section');
    expect(t, PAGE).toContain('If the season ended today');
    expect(t, PAGE).toContain('Tournament line');
    expect(t, PAGE).toContain(`5 ${short(CS)} at 4 ${short(MC)}`);
    expect(t, PAGE).toContain(`6 ${short(LW)} at 3 ${short(RW)}`);
    expect(t, PAGE).toContain('Lowest-ranked remaining seed');
    expect(t, PAGE).toContain('Highest-ranked remaining seed of 3-6');
    expect(t, PAGE).toContain('Fri Oct 30 · at Tamalpais');
    expect(t, PAGE).toContain('How it works');
    expect(t, PAGE).toContain('This site follows the 2026 sheet.');
  });

  it('marks the pinned team like every other team list: data-team-slug on the row, the hidden note in its link', () => {
    const rows = [...html.matchAll(/<tr data-team-slug="([^"]+)"[\s\S]*?<a [^>]*href="\/teams\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    // Every MCAL team has a row in the seeds table, seeded or not.
    expect(new Set(rows.map((m) => m[1])), 'components/playoffs/LeagueTournament.tsx seed rows').toEqual(
      new Set([AW, RW, TM, BK, LW, UN, MC, CS, MA]),
    );
    for (const [, slug, href, inner] of rows) {
      expect(href, 'components/playoffs/LeagueTournament.tsx row link').toBe(slug);
      expect(inner, 'components/playoffs/LeagueTournament.tsx pin note').toContain(
        '<span class="sr-only"><span class="sx-pin-note">Your team. </span>',
      );
    }
  });

  it('carries no CCS concept inside the page except the link to the CCS page', () => {
    for (const banned of ['automatic qualifier', 'Automatic qualifier', 'at-large', 'At-large', 'CCS Division', 'CCS picture']) {
      expect(html, `${PAGE}: ${banned}`).not.toContain(banned);
    }
    const ccs = text().match(/CCS[^)]*\)/g) ?? [];
    expect(ccs, `${PAGE}: CCS only in the link`).toEqual(['CCS playoffs (SCVAL, BVAL, PCAL)']);
    expect(html, PAGE).not.toMatch(/eliminat/i);
  });

  it('404s an unknown, CCS or unbracketed (EAL) league before any accessor that throws (page and OG image)', async () => {
    // eal: the Super Regional publishes no bracket, so it has a card on /playoffs, never a page here.
    for (const league of ['scval', 'nope', 'ccs', 'eal']) {
      await expect(page.default({ params: Promise.resolve({ league }) } as never), `${PAGE}: ${league}`).rejects.toMatchObject({
        digest: expect.stringContaining('404'),
      });
      await expect(og.default({ params: Promise.resolve({ league }) } as never), `${OG}: ${league}`).rejects.toMatchObject({
        digest: expect.stringContaining('404'),
      });
    }
  });
});
