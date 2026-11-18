/**
 * Team pages once the postseason is over (2026-11-16), on the committed snapshot (data/field-hockey/snapshot.json): every
 * team's postseason line, and the empty Next card under it, is read from the results and the snapshot's day, so a
 * data refresh moves them with no copy to edit by hand. The invariant here is what keeps that true: once a team's
 * postseason has had its last day, its line projects nothing, promises no game, and says no event "is under way".
 *
 * - CCS and San Diego Section bracket teams read their finish ('CCS Division 1 champion', 'Lost in the CCS
 *   Division 2 semifinal', 'Won the Open Division final'), and a team that went out early ends with how its bracket
 *   ended, never the next round as still to come (components/teams/team-view.ts bracketAwareLine).
 * - A CCS or San Diego team in no bracket reads 'Not in the CCS field' / 'Not in the San Diego Section playoffs'
 *   (components/playoffs/team-postseason-line.ts).
 * - The EAL's Super Regional and the Tournament of Champions read the team's finish off the event's bracket
 *   (components/playoffs/tournament-bracket-view.ts eventFinish).
 * - The MCAL tournament's teams below the line read it in the past tense once it is complete.
 */
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type Teams = typeof import('../../lib/teams');
type View = typeof import('../../components/teams/team-view');
type Sections = typeof import('../../lib/league-config/sections');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let leagues: Leagues;
let teams: Teams;
let view: View;
let sections: Sections;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = path.resolve(__dirname, '../../data/field-hockey/snapshot.json');
  vi.resetModules();
  data = await import('../../lib/data');
  leagues = await import('../../lib/leagues');
  teams = await import('../../lib/teams');
  view = await import('../../components/teams/team-view');
  sections = await import('../../lib/league-config/sections');
});

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

/** The last day of a league's postseason, by its kind. */
function postseasonLastDay(leagueId: string): string {
  const league = leagues.getLeague(leagueId as Parameters<Leagues['getLeague']>[0]);
  const ps = league.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      return sections.ccsLastDay(sections.CCS.keyDates);
    case 'league-tournament':
      return [...ps.rounds].map((r) => r.date).sort().at(-1)!;
    case 'unbracketed-tournament':
    case 'section-playoffs':
      return ps.dates.last;
    case 'no-postseason':
      return leagues.outsideTournamentOf(league.sectionId)?.window.last ?? '0000-00-00';
  }
}

/** Every team whose league's postseason has had its last day on the snapshot's day. */
function finishedTeams() {
  const today = data.getToday();
  return teams.TEAMS.filter((t) => today > postseasonLastDay(t.league));
}

/**
 * True once every league's postseason is over on the snapshot's day. The update-data workflow runs this suite on the
 * snapshot it just wrote, so the season-end assertions below hold only then: in season they pass with nothing to
 * check, and never block a refresh.
 */
const allOver = () => finishedTeams().length === teams.TEAMS.length;

describe('team pages after the postseason (committed snapshot)', () => {
  it('no finished team’s status projects, promises a game, or calls an event under way', () => {
    const done = finishedTeams();
    const stale = [
      /Projected from the table/,
      /\bis under way\b/,
      /at-large berths are the CCS committee/,
      /^Placed by the Section$/,
      /^At-large consideration$/,
      /^Automatic qualifier$/,
      /^(Super Regional place|In the Tournament of Champions)$/,
      /\bplays\b/,
      /\bgoes on to\b/,
      /\bwe list each\b|\bwe will list\b/i,
      /\bfollows?,/,
    ];
    const problems: string[] = [];
    for (const team of done) {
      const page = view.buildTeamPageView(team.slug)!;
      const line = page.postseasonLine;
      const card = page.nextCard;
      const texts = [line?.label ?? '', line?.sentence ?? '', line?.caveat ?? '', card.kind === 'none' ? card.body : ''];
      for (const text of texts) {
        for (const pattern of stale) if (pattern.test(text)) problems.push(`${team.slug}: ${pattern} — “${text}”`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('each CCS division has one champion and one runner-up, and every other CCS team lost in a round or was not in the field', () => {
    if (!allOver()) return;
    const ccs = teams.TEAMS.filter((t) => leagues.getLeague(t.league).postseason.kind === 'ccs-ladder');
    const labels = ccs.map((t) => view.buildTeamPageView(t.slug)!.postseasonLine?.label ?? 'NULL');
    for (const label of labels) {
      expect(label).toMatch(/^(CCS Division \d (champion|runner-up)|Lost in the CCS Division \d (quarterfinal|semifinal)|Not in the CCS field)$/);
    }
    for (const division of ['CCS Division 1', 'CCS Division 2']) {
      expect(labels.filter((l) => l === `${division} champion`), division).toHaveLength(1);
      expect(labels.filter((l) => l === `${division} runner-up`), division).toHaveLength(1);
    }
    // Sixteen teams make the field (SCVAL 7, BVAL 4, PCAL 2, three at-large); the rest of the three leagues are out.
    expect(labels.filter((l) => l !== 'Not in the CCS field')).toHaveLength(16);
  });

  it('an early exit ends with how its bracket finished, never a later round as still to come', () => {
    if (!allOver()) return;
    const line = view.buildTeamPageView('valley-christian')!.postseasonLine!;
    expect(line.label).toBe('Lost in the CCS Division 1 quarterfinal');
    expect(line.sentence).toMatch(/ won CCS Division 1\.$/);
  });

  it('San Diego Section teams read their finish, and never the word champion (DESIGN §24.5)', () => {
    if (!allOver()) return;
    const sds = teams.TEAMS.filter((t) => leagues.getLeague(t.league).postseason.kind === 'section-playoffs');
    for (const t of sds) {
      const line = view.buildTeamPageView(t.slug)!.postseasonLine!;
      expect(line.label, t.slug).toMatch(/^(Won the .+ final|Lost in the .+|Not in the San Diego Section playoffs)$/);
      expect(`${line.label} ${line.sentence}`, t.slug).not.toMatch(/champion/i);
    }
  });

  it('the Super Regional and the Tournament of Champions read each team’s finish', () => {
    if (!allOver()) return;
    const eal = teams.TEAMS.filter((t) => t.league === 'eal').map((t) => view.buildTeamPageView(t.slug)!.postseasonLine!.label);
    expect(eal.filter((l) => l === 'Won the Super Regional')).toHaveLength(1);
    expect(eal.filter((l) => l === 'Runner-up in the Super Regional')).toHaveLength(1);
    const toc = teams.TEAMS.filter((t) => t.league === 'sunset' || t.league === 'independents').map(
      (t) => view.buildTeamPageView(t.slug)!.postseasonLine!.label,
    );
    expect(toc.filter((l) => l === 'Won the Tournament of Champions')).toHaveLength(1);
    expect(toc.filter((l) => l === 'Runner-up in the Tournament of Champions')).toHaveLength(1);
    for (const l of [...eal, ...toc]) expect(l).not.toMatch(/eliminat|seed/i);
  });

  it('an MCAL team below the line reads the finished tournament in the past tense', () => {
    if (!allOver()) return;
    const line = view.buildTeamPageView('archie-williams')!.postseasonLine!;
    expect(line.sentence).toBe('The six-team MCAL tournament was played without Archie Williams; its season ended with its last league game.');
  });
});
