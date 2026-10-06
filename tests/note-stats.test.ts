/**
 * lib/note-stats.ts — goals and saves a coach wrote in MaxPreps' game note, added to the MaxPreps
 * numbers — and lib/name-aliases.ts, the spellings that tie a note to a roster player.
 *
 * The rules are asserted on synthetic games carrying Homestead's real notes (Sep 28 – Oct 5), so
 * they hold whatever the next refresh brings; the committed data is checked only against rules
 * that every refresh must keep.
 */

import { describe, expect, it } from 'vitest';

import { buildPlayerStatsView } from '../components/teams/player-stats-view';
import { getSnapshot } from '../lib/data';
import { NAME_ALIASES } from '../lib/name-aliases';
import {
  getAllPlayerStatsWithNotes,
  noteStatsFor,
  parseStatNote,
  resolveName,
  withNoteStats,
  type NoteRosterPlayer,
  type NoteSources,
} from '../lib/note-stats';
import { FIELD_STAT_KEYS, GOALIE_STAT_KEYS, type PlayerStatLine, type TeamPlayerStats } from '../lib/player-stats-schema';
import { getTeamRoster } from '../lib/rosters';
import { getTeamBySlug } from '../lib/teams';
import type { Game, TeamSlug } from '../lib/types';
import { game } from './game-builder';

// ---------------------------------------------------------------- fixtures

function rosterPlayer(fullName: string, id: string): NoteRosterPlayer {
  const [firstName, ...rest] = fullName.split(' ');
  return {
    athleteId: `a-${id}`,
    careerId: `c-${id}`,
    careerUrl: null,
    fullName,
    firstName,
    lastName: rest.join(' '),
    jersey: null,
  };
}

const HOMESTEAD: NoteRosterPlayer[] = [
  rosterPlayer('Sarah Anton', 'anton'),
  rosterPlayer('Kaylee Ouyang', 'ouyang'),
  rosterPlayer('Olivia Leyton Bravo', 'leyton'),
  rosterPlayer('Gabrielle Moll', 'moll'),
  rosterPlayer('Emry Borges', 'borges'),
  rosterPlayer('Lacey Sebastian Carattini', 'lacey'),
  rosterPlayer('Noa Frank', 'noa'),
  rosterPlayer('Emma Leu', 'leu'),
  rosterPlayer('Emma Chen', 'chen'),
];
const FREMONT: NoteRosterPlayer[] = [rosterPlayer('Maya Ortiz', 'ortiz'), rosterPlayer('Lacey Tran', 'tran')];
const ROSTERS: Record<string, NoteRosterPlayer[]> = { homestead: HOMESTEAD, fremont: FREMONT, cupertino: [], 'saint-francis': [] };

function noted(g: Game, text: string | null): Game {
  return { ...g, venue: { ...g.venue, text } };
}

/** Homestead's three noted games as MaxPreps published them, plus a goal-less final. */
function homesteadGames(): Game[] {
  return [
    noted(game({ home: 'santa-clara', away: 'homestead', hs: 0, as: 4, date: '2026-08-24', league: false }), null),
    noted(
      game({ home: 'saint-francis', away: 'homestead', hs: 10, as: 0, date: '2026-09-28' }),
      'Lacey played 3Q had 7 saves. Noa played last…',
    ),
    noted(game({ home: 'homestead', away: 'fremont', hs: 2, as: 1, date: '2026-09-30' }), 'goals scored Gabby Molly, Emry Borges'),
    noted(
      game({ home: 'homestead', away: 'cupertino', hs: 1, as: 1, date: '2026-10-05' }),
      'tied in OT 1:1  goal scored by Emery Borges',
    ),
    noted(game({ home: 'fremont', away: 'homestead', date: '2026-10-28', status: 'scheduled' }), 'Senior Night'),
  ];
}

function sources(games: Game[] = homesteadGames()): NoteSources {
  return { games, roster: (slug) => ROSTERS[slug] };
}

function statLine(name: string, id: string, goals: number, gp: number): PlayerStatLine {
  return {
    careerId: `c-${id}`,
    careerUrl: null,
    athleteId: `a-${id}`,
    fullName: name,
    shortName: name,
    jersey: null,
    onRoster: true,
    field: { ...Object.fromEntries(FIELD_STAT_KEYS.map((k) => [k, null])), gamesPlayed: gp, goals, points: 2 * goals } as PlayerStatLine['field'],
    goalkeeping: null,
  };
}

/** Homestead's MaxPreps stats as they stood from Sep 28 to Oct 5: four one-goal scorers, no goalkeeping. */
function homesteadStats(): TeamPlayerStats {
  const team = getTeamBySlug('homestead')!;
  return {
    slug: 'homestead',
    teamId: team.id,
    name: 'Homestead',
    maxprepsTeamId: team.id,
    statsUrl: null,
    status: 'ok',
    lastUpdated: '2026-10-03T09:15:52',
    tracked: { field: ['gamesPlayed', 'goals', 'points'], goalkeeping: [] },
    totals: { field: { gamesPlayed: 11, goals: 4, points: 8 }, goalkeeping: {} },
    players: [
      statLine('Sarah Anton', 'anton', 1, 8),
      statLine('Kaylee Ouyang', 'ouyang', 1, 10),
      statLine('Olivia Leyton Bravo', 'leyton', 1, 10),
      statLine('Gabrielle Moll', 'moll', 1, 9),
    ],
    warnings: [],
    fetchedAt: '2026-10-05T21:23:12.682Z',
    error: null,
  };
}

// ---------------------------------------------------------------- parsing

describe('parseStatNote', () => {
  it("reads Homestead's notes", () => {
    expect(parseStatNote('goals scored Gabby Molly, Emry Borges')).toEqual({
      goals: [
        { written: 'Gabby Molly', count: 1 },
        { written: 'Emry Borges', count: 1 },
      ],
      saves: [],
      unread: [],
    });
    expect(parseStatNote('tied in OT 1:1  goal scored by Emery Borges').goals).toEqual([{ written: 'Emery Borges', count: 1 }]);
    expect(parseStatNote('Lacey played 3Q had 7 saves. Noa played last…')).toEqual({
      goals: [],
      saves: [{ written: 'Lacey', count: 7 }],
      unread: [],
    });
  });

  it('reads counts, other lead-ins and other list separators', () => {
    expect(parseStatNote('Goals: Emry Borges (2), Sarah Anton & Kaylee Ouyang x2').goals).toEqual([
      { written: 'Emry Borges', count: 2 },
      { written: 'Sarah Anton', count: 1 },
      { written: 'Kaylee Ouyang', count: 2 },
    ]);
    expect(parseStatNote('Goals by Max 2 and Borges 3').goals).toEqual([
      { written: 'Max', count: 2 },
      { written: 'Borges', count: 3 },
    ]);
    expect(parseStatNote('12 saves by Noa Frank').saves).toEqual([{ written: 'Noa Frank', count: 12 }]);
    expect(parseStatNote('Lacey 4 saves, Noa 2 saves').saves).toEqual([
      { written: 'Lacey', count: 4 },
      { written: 'Noa', count: 2 },
    ]);
  });

  it('finds nothing in the notes that are not stats', () => {
    for (const note of [
      'Senior Night',
      '3 games guaranteed',
      'Played at York School under sunny skies, high…',
      '49th Annual Berger Invitational Varsity Field…',
      '@ Leigh Round Up',
      'Havoc Tournament at UC Berkeley',
      null,
      '',
    ]) {
      expect(parseStatNote(note), String(note)).toEqual({ goals: [], saves: [], unread: [] });
    }
  });

  it('keeps what it cannot read as a name aside rather than guessing', () => {
    expect(parseStatNote('goals scored by #12, Emry Borges')).toEqual({
      goals: [{ written: 'Emry Borges', count: 1 }],
      saves: [],
      unread: ['#12'],
    });
  });
});

// ---------------------------------------------------------------- names

describe('resolveName', () => {
  const at = (written: string) => resolveName(written, 'homestead', HOMESTEAD)?.player.fullName ?? null;

  it('matches the full name, a curated alias, or a first or last name only one player has', () => {
    expect(resolveName('Emry Borges', 'homestead', HOMESTEAD)?.via).toBe('roster');
    expect(resolveName('emry  BORGES', 'homestead', HOMESTEAD)?.via).toBe('roster');
    expect(resolveName('Emery Borges', 'homestead', HOMESTEAD)).toMatchObject({ via: 'alias', player: { fullName: 'Emry Borges' } });
    expect(resolveName('Gabby Molly', 'homestead', HOMESTEAD)).toMatchObject({ via: 'alias', player: { fullName: 'Gabrielle Moll' } });
    expect(resolveName('Lacey', 'homestead', HOMESTEAD)).toMatchObject({ via: 'first-name', player: { fullName: 'Lacey Sebastian Carattini' } });
    expect(resolveName('Borges', 'homestead', HOMESTEAD)).toMatchObject({ via: 'last-name', player: { fullName: 'Emry Borges' } });
  });

  it('refuses a shared first name, a near miss with no alias, and another team\'s alias', () => {
    expect(at('Emma')).toBeNull();
    expect(at('Gabrielle Molly')).toBeNull();
    expect(at('Emery')).toBeNull();
    expect(resolveName('Emery Borges', 'fremont', [rosterPlayer('Emry Borges', 'x')])).toBeNull();
  });
});

describe('NAME_ALIASES', () => {
  it("names a player on the team's committed roster, and never shadows another player's real name", () => {
    for (const a of NAME_ALIASES) {
      const roster = getTeamRoster(a.team)?.players ?? [];
      expect(roster.filter((p) => p.fullName === a.fullName), `${a.team}: ${a.fullName}`).toHaveLength(1);
      expect(roster.some((p) => p.fullName.toLowerCase() === a.written.toLowerCase()), a.written).toBe(false);
      expect(a.basis.length).toBeGreaterThan(0);
    }
  });

  it('ties both of Homestead\'s spellings to Emry Borges, and Gabby Molly to Gabrielle Moll', () => {
    const roster = getTeamRoster('homestead')!.players;
    expect(resolveName('Emery Borges', 'homestead', roster)?.player.fullName).toBe('Emry Borges');
    expect(resolveName('Emry Borges', 'homestead', roster)?.player.fullName).toBe('Emry Borges');
    expect(resolveName('Gabby Molly', 'homestead', roster)?.player.fullName).toBe('Gabrielle Moll');
    expect(resolveName('Lacey', 'homestead', roster)?.player.fullName).toBe('Lacey Sebastian Carattini');
  });
});

// ---------------------------------------------------------------- credits

describe('noteStatsFor', () => {
  it("credits Homestead's notes to its players, game by game", () => {
    const notes = noteStatsFor('homestead', sources());
    expect(notes.credits.map((c) => [c.dateKey, c.fullName, c.via, c.goals, c.saves, c.site, c.opponent])).toEqual([
      ['2026-09-28', 'Lacey Sebastian Carattini', 'first-name', 0, 7, 'away', 'Saint Francis'],
      ['2026-09-30', 'Gabrielle Moll', 'alias', 1, 0, 'home', 'Fremont'],
      ['2026-09-30', 'Emry Borges', 'roster', 1, 0, 'home', 'Fremont'],
      ['2026-10-05', 'Emry Borges', 'alias', 1, 0, 'home', 'Cupertino'],
    ]);
    // 4 + 0 + 2 + 1: the finals' goals, the scheduled game left out.
    expect(notes.goalsFor).toBe(7);
    expect(notes.warnings).toEqual([]);
  });

  it("credits a name on the other roster to the other team, and a name on both to neither", () => {
    const games = [
      noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 1, date: '2026-09-30' }), 'goals scored Emry Borges, Maya Ortiz'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 0, as: 0, date: '2026-10-28' }), 'Lacey had 9 saves'),
    ];
    expect(noteStatsFor('homestead', sources(games)).credits.map((c) => c.fullName)).toEqual(['Emry Borges']);
    expect(noteStatsFor('fremont', sources(games)).credits.map((c) => c.fullName)).toEqual(['Maya Ortiz']);
    expect(noteStatsFor('homestead', sources(games)).warnings).toEqual([
      '2026-10-28 Fremont at Homestead: "Lacey" is on both rosters; not counted',
    ]);
  });

  it('counts only finals, never more goals than the team scored, and reports what it leaves out', () => {
    const games = [
      noted(game({ home: 'homestead', away: 'fremont', date: '2026-10-28', status: 'scheduled' }), 'goals scored Emry Borges'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 0, date: '2026-09-30' }), 'goals scored Emry Borges, Sarah Anton'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 3, as: 0, date: '2026-10-01', forfeit: true }), 'goals scored Sarah Anton'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 2, as: 0, date: '2026-10-02' }), 'goals scored Emry Borges, Pat Nobody'),
    ];
    const notes = noteStatsFor('homestead', sources(games));
    expect(notes.credits.map((c) => [c.dateKey, c.fullName, c.goals])).toEqual([['2026-10-02', 'Emry Borges', 1]]);
    expect(notes.warnings).toHaveLength(4);
    expect(notes.warnings.join('\n')).toMatch(/not a final/);
    expect(notes.warnings.join('\n')).toMatch(/credits 2 goals but Homestead scored 1/);
    expect(notes.warnings.join('\n')).toMatch(/"Pat Nobody" is on neither roster/);
  });
});

// ---------------------------------------------------------------- merging

describe('withNoteStats', () => {
  it("adds Homestead's noted goals and saves to the MaxPreps numbers, 2 points a goal", () => {
    const team = homesteadStats();
    const before = structuredClone(team);
    const merged = withNoteStats(team, noteStatsFor('homestead', sources([...homesteadGames(), ...padding(8)])));
    expect(team).toEqual(before);

    const line = (name: string) => merged.players.find((p) => p.fullName === name)!;
    expect(line('Gabrielle Moll').field).toMatchObject({ gamesPlayed: 9, goals: 2, points: 4 });
    expect(line('Sarah Anton').field).toMatchObject({ goals: 1, points: 2 });
    // Not on the stats sheet at all: a line of her own, games played unknown rather than 0.
    expect(line('Emry Borges')).toMatchObject({
      careerId: 'c-borges',
      shortName: 'E. Borges',
      onRoster: true,
      field: { gamesPlayed: null, goals: 2, points: 4, assists: null },
      goalkeeping: null,
    });
    expect(line('Lacey Sebastian Carattini').field).toBeNull();
    expect(line('Lacey Sebastian Carattini').goalkeeping).toEqual({
      ...Object.fromEntries(GOALIE_STAT_KEYS.map((k) => [k, null])),
      saves: 7,
    });
    expect(merged.tracked).toEqual({ field: ['gamesPlayed', 'goals', 'points'], goalkeeping: ['saves'] });
    expect(merged.totals).toEqual({ field: { gamesPlayed: 11, goals: 7, points: 14 }, goalkeeping: { saves: 7 } });
    expect(merged.noteCredits).toHaveLength(4);
    // Saves are tracked only because a note filled them; goals were on the stats sheet already.
    expect(merged.noteTracked).toEqual({ field: [], goalkeeping: ['saves'] });
  });

  it('adds no noted goal when MaxPreps and the notes together would pass the goals scored', () => {
    // homesteadGames() alone: 7 goals scored, MaxPreps holds 4, the notes 3 — exactly enough.
    expect(withNoteStats(homesteadStats(), noteStatsFor('homestead', sources())).totals.field.goals).toBe(7);
    const entered = homesteadStats();
    entered.players.push(statLine('Emry Borges', 'borges', 1, 11));
    entered.totals.field.goals = 5;
    const merged = withNoteStats(entered, noteStatsFor('homestead', sources()));
    expect(merged.totals.field.goals).toBe(5);
    expect(merged.players.find((p) => p.fullName === 'Emry Borges')!.field!.goals).toBe(1);
    // The saves are still added.
    expect(merged.noteCredits.map((c) => [c.fullName, c.goals, c.saves])).toEqual([['Lacey Sebastian Carattini', 0, 7]]);
    expect(merged.warnings.at(-1)).toMatch(/credit 3 goals, but MaxPreps already has 5 of the 7 scored/);
  });

  it('changes nothing for a team without notes', () => {
    const team = homesteadStats();
    expect(withNoteStats(team, { slug: 'homestead', credits: [], goalsFor: 0, warnings: [] })).toEqual({
      ...team,
      noteCredits: [],
      noteTracked: { field: [], goalkeeping: [] },
    });
  });
});

/** Goal-scoring finals with no note, so the goals-scored cap is not what a test is about. */
function padding(goals: number): Game[] {
  return [noted(game({ home: 'homestead', away: 'lynbrook', hs: goals, as: 0, date: '2026-09-04' }), null)];
}

// ---------------------------------------------------------------- the team page

describe('the team page view', () => {
  it('marks the rows and cards a note added to, and lists each noted game with its note', () => {
    const merged = withNoteStats(homesteadStats(), noteStatsFor('homestead', sources()));
    const view = buildPlayerStatsView('homestead', [], merged)!;
    expect(view.scoring!.rows.map((r) => [r.name, r.values, r.noted])).toEqual([
      ['Gabrielle Moll', [9, 2, 4], true],
      ['Emry Borges', [null, 2, 4], true],
      ['Kaylee Ouyang', [10, 1, 2], false],
      ['Olivia Leyton Bravo', [10, 1, 2], false],
      ['Sarah Anton', [8, 1, 2], false],
    ]);
    expect(view.goalies.map((g) => [g.name, g.stats, g.noted])).toEqual([
      ['Lacey Sebastian Carattini', [{ label: 'Saves', text: '7' }], true],
    ]);
    // The only goalkeeping is a note's, so the footnote on figures as entered does not apply.
    expect(view.goalkeepingEntered).toBe(false);
    expect(view.notedGames.map(({ game: g, added, note }) => [g, added, note])).toEqual([
      ['Mon Sep 28 at Saint Francis', 'seven saves for Lacey Sebastian Carattini', 'Lacey played 3Q had 7 saves. Noa played last…'],
      ['Wed Sep 30 vs Fremont', 'a goal each for Gabrielle Moll and Emry Borges', 'goals scored Gabby Molly, Emry Borges'],
      ['Mon Oct 5 vs Cupertino', 'a goal for Emry Borges', 'tied in OT 1:1  goal scored by Emery Borges'],
    ]);
  });

  it('marks nothing for a team the notes add nothing to', () => {
    const view = buildPlayerStatsView('homestead', [], homesteadStats())!;
    expect(view.notedGames).toEqual([]);
    expect(view.scoring!.rows.some((r) => r.noted)).toBe(false);
  });
});

// ---------------------------------------------------------------- the committed data

describe('the committed data', () => {
  const games = getSnapshot().games;

  it('credits only finals of the team, each to one of its roster players, within every guard', () => {
    for (const team of getAllPlayerStatsWithNotes()) {
      const roster = getTeamRoster(team.slug as TeamSlug)?.players ?? [];
      const perGame = new Map<string, number>();
      for (const c of team.noteCredits) {
        const g = games.find((x) => x.contestId === c.contestId)!;
        const side = g.home.slug === team.slug ? g.home : g.away;
        expect(g.status, c.contestId).toBe('final');
        expect(side.slug).toBe(team.slug);
        expect(roster.some((p) => p.athleteId === c.athleteId && p.fullName === c.fullName), c.fullName).toBe(true);
        perGame.set(c.contestId, (perGame.get(c.contestId) ?? 0) + c.goals);
        expect(perGame.get(c.contestId)!, c.contestId).toBeLessThanOrEqual(side.score!);
      }
      // A team without notes keeps the footnote on goalkeeping figures as entered.
      if (team.noteCredits.length === 0) {
        const view = buildPlayerStatsView(team.slug as TeamSlug, [], team)!;
        expect(view.goalkeepingEntered, team.slug).toBe(view.goalies.length > 0);
      }
      // MaxPreps' goals plus the noted ones never pass the goals the team has scored.
      if (team.noteCredits.some((c) => c.goals > 0)) {
        expect(team.totals.field.goals!, team.slug).toBeLessThanOrEqual(noteStatsFor(team.slug as TeamSlug).goalsFor);
      }
    }
  });
});
