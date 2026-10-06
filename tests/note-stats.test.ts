/**
 * lib/note-stats.ts — goals, assists and saves a coach wrote in MaxPreps' game note, added to the
 * MaxPreps numbers for any team — lib/name-aliases.ts, and the per-game totals that keep a noted
 * stat from counting twice (lib/sources/maxpreps-game-stats.ts).
 *
 * The rules are asserted on synthetic games, Homestead's real notes among them (Sep 28 – Oct 5),
 * so they hold whatever the next refresh brings; the committed data is checked only against rules
 * that every refresh must keep.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildPlayerStatsView } from '../components/teams/player-stats-view';
import { getSnapshot } from '../lib/data';
import { NAME_ALIASES } from '../lib/name-aliases';
import {
  noteStatsFor,
  parseStatNote,
  resolveName,
  teamsCreditedByNotes,
  withNoteStats,
  type NoteRosterPlayer,
  type NoteSources,
  type ParsedNote,
} from '../lib/note-stats';
import { getAllPlayerStatsWithNotes, getPlayerStats } from '../lib/player-stats';
import { FIELD_STAT_KEYS, GOALIE_STAT_KEYS, type PlayerStatLine, type TeamPlayerStats } from '../lib/player-stats-schema';
import { getTeamRoster } from '../lib/rosters';
import { contestIdFromUrl, parseGameStats } from '../lib/sources/maxpreps-game-stats';
import { getTeamBySlug } from '../lib/teams';
import type { Game, TeamSlug } from '../lib/types';
import { game } from './game-builder';
import { FIXTURE_DIR, buildFixturePlayerStats } from './helpers';

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

const IDS = {
  sf: '00000000-0000-4000-8000-00000000a928',
  fremont: '00000000-0000-4000-8000-00000000a930',
  cupertino: '00000000-0000-4000-8000-00000000a105',
};

/** Homestead's three noted games as MaxPreps published them, plus a goal-less final. */
function homesteadGames(): Game[] {
  return [
    noted(game({ home: 'santa-clara', away: 'homestead', hs: 0, as: 4, date: '2026-08-24', league: false }), null),
    noted(
      game({ home: 'saint-francis', away: 'homestead', hs: 10, as: 0, date: '2026-09-28', contestId: IDS.sf }),
      'Lacey played 3Q had 7 saves. Noa played last…',
    ),
    noted(
      game({ home: 'homestead', away: 'fremont', hs: 2, as: 1, date: '2026-09-30', contestId: IDS.fremont }),
      'goals scored Gabby Molly, Emry Borges',
    ),
    noted(
      game({ home: 'homestead', away: 'cupertino', hs: 1, as: 1, date: '2026-10-05', contestId: IDS.cupertino }),
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

const none = (): ParsedNote => ({ goals: [], assists: [], saves: [], unread: [] });
const parsed = (p: Partial<ParsedNote>): ParsedNote => ({ ...none(), ...p });

// ---------------------------------------------------------------- parsing

describe('parseStatNote', () => {
  it("reads Homestead's notes", () => {
    expect(parseStatNote('goals scored Gabby Molly, Emry Borges')).toEqual(
      parsed({ goals: [{ written: 'Gabby Molly', count: 1 }, { written: 'Emry Borges', count: 1 }] }),
    );
    expect(parseStatNote('tied in OT 1:1  goal scored by Emery Borges')).toEqual(
      parsed({ goals: [{ written: 'Emery Borges', count: 1 }] }),
    );
    expect(parseStatNote('Lacey played 3Q had 7 saves. Noa played last…')).toEqual(
      parsed({ saves: [{ written: 'Lacey', count: 7 }] }),
    );
  });

  it('reads scorer lists with counts and assists', () => {
    expect(parseStatNote('Goals: Emry Borges (2), Sarah Anton & Kaylee Ouyang x2')).toEqual(
      parsed({
        goals: [
          { written: 'Emry Borges', count: 2 },
          { written: 'Sarah Anton', count: 1 },
          { written: 'Kaylee Ouyang', count: 2 },
        ],
      }),
    );
    expect(parseStatNote('Goals by Max 2 and Borges 3').goals).toEqual([
      { written: 'Max', count: 2 },
      { written: 'Borges', count: 3 },
    ]);
    expect(parseStatNote('Goals: Moll from Anton, Borges (assist Ouyang)')).toEqual(
      parsed({
        goals: [{ written: 'Moll', count: 1 }, { written: 'Borges', count: 1 }],
        assists: [{ written: 'Anton', count: 1 }, { written: 'Ouyang', count: 1 }],
      }),
    );
    expect(parseStatNote('Goals: Moll, Borges; Assists: Anton')).toEqual(
      parsed({ goals: [{ written: 'Moll', count: 1 }, { written: 'Borges', count: 1 }], assists: [{ written: 'Anton', count: 1 }] }),
    );
  });

  it('reads one statement per piece', () => {
    expect(parseStatNote('Emry Borges scored twice, Sarah Anton scored').goals).toEqual([
      { written: 'Emry Borges', count: 2 },
      { written: 'Sarah Anton', count: 1 },
    ]);
    expect(parseStatNote('Moll and Borges scored').goals).toEqual([
      { written: 'Moll', count: 1 },
      { written: 'Borges', count: 1 },
    ]);
    expect(parseStatNote('Borges 2 goals, Anton had an assist, Ouyang with two assists')).toEqual(
      parsed({
        goals: [{ written: 'Borges', count: 2 }],
        assists: [{ written: 'Anton', count: 1 }, { written: 'Ouyang', count: 2 }],
      }),
    );
    expect(parseStatNote('Borges hat trick').goals).toEqual([{ written: 'Borges', count: 3 }]);
    expect(parseStatNote('Hat trick for Emry Borges!').goals).toEqual([{ written: 'Emry Borges', count: 3 }]);
    expect(parseStatNote('Borges scored a hat trick').goals).toEqual([{ written: 'Borges', count: 3 }]);
    expect(parseStatNote('12 saves by Noa Frank').saves).toEqual([{ written: 'Noa Frank', count: 12 }]);
    expect(parseStatNote('Lacey 4 saves, Noa 2 saves').saves).toEqual([
      { written: 'Lacey', count: 4 },
      { written: 'Noa', count: 2 },
    ]);
    expect(parseStatNote('Lacey 4 saves and Noa 2 saves').saves).toEqual([
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
      'Highland Cup Tournament - Helix High School',
      'Too be rescheduled',
      'No Game Due To Heat',
      null,
      '',
    ]) {
      expect(parseStatNote(note), String(note)).toEqual(none());
    }
  });

  it('keeps what mentions a stat but cannot be read aside, rather than guessing', () => {
    expect(parseStatNote('goals scored by #12, Emry Borges')).toEqual(
      parsed({ goals: [{ written: 'Emry Borges', count: 1 }], unread: ['#12'] }),
    );
    expect(parseStatNote('2 goals in the second half').unread).toEqual(['2 goals in the second half']);
  });

  it('names the teams a note on a final credits: not the other side of the game', () => {
    expect([...teamsCreditedByNotes(sources())]).toEqual(['homestead']);
    const both = [noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 1, date: '2026-09-30' }), 'goals scored Emry Borges, Maya Ortiz')];
    expect([...teamsCreditedByNotes(sources(both))].sort()).toEqual(['fremont', 'homestead']);
  });
});

// ---------------------------------------------------------------- names

describe('resolveName', () => {
  const at = (written: string) => resolveName(written, 'homestead', HOMESTEAD, [])?.player.fullName ?? null;
  const via = (written: string) => resolveName(written, 'homestead', HOMESTEAD, [])?.via ?? null;

  it('matches the full name, a curated alias, or a first or last name only one player has', () => {
    expect(via('Emry Borges')).toBe('roster');
    expect(via('emry  BORGES')).toBe('roster');
    expect(resolveName('Emery Borges', 'homestead', HOMESTEAD)).toMatchObject({ via: 'alias', player: { fullName: 'Emry Borges' } });
    expect([at('Lacey'), via('Lacey')]).toEqual(['Lacey Sebastian Carattini', 'first-name']);
    expect([at('Borges'), via('Borges')]).toEqual(['Emry Borges', 'last-name']);
  });

  it('matches a nickname, a name one letter off, and part of a longer last name, with no alias', () => {
    expect([at('Gabby Molly'), via('Gabby Molly')]).toEqual(['Gabrielle Moll', 'nickname']);
    expect([at('Gabby Moll'), via('Gabby Moll')]).toEqual(['Gabrielle Moll', 'nickname']);
    expect([at('Emery Borges'), via('Emery Borges')]).toEqual(['Emry Borges', 'near-spelling']);
    expect([at('Sara Anton'), via('Sara Anton')]).toEqual(['Sarah Anton', 'near-spelling']);
    expect([at('Lacey Carattini'), via('Lacey Carattini')]).toEqual(['Lacey Sebastian Carattini', 'partial']);
    expect([at('Olivia Bravo'), via('Olivia Bravo')]).toEqual(['Olivia Leyton Bravo', 'partial']);
  });

  it('refuses a shared name, a short name one letter off, two letters off, and a near miss that fits two players', () => {
    expect(at('Emma')).toBeNull();
    expect(at('Emery')).toBeNull(); // a lone name gets no spelling tolerance
    expect(at('Noah Frank')).toBeNull(); // "Noa" is under four letters
    expect(at('Emmet Borges')).toBeNull();
    expect(at('Gabriella Molloy')).toBeNull();
    const twins = [rosterPlayer('Emma Leu', 'leu'), rosterPlayer('Emma Lea', 'lea')];
    expect(resolveName('Emma Lee', 'homestead', twins, [])).toBeNull();
    // An alias belongs to its team; elsewhere the same spelling falls to the general rules.
    expect(resolveName('Emery Borges', 'fremont', [rosterPlayer('Emry Borges', 'x')])?.via).toBe('near-spelling');
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

  it("ties Homestead's spellings to its committed roster's players", () => {
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
      ['2026-09-30', 'Gabrielle Moll', 'nickname', 1, 0, 'home', 'Fremont'],
      ['2026-09-30', 'Emry Borges', 'roster', 1, 0, 'home', 'Fremont'],
      ['2026-10-05', 'Emry Borges', 'alias', 1, 0, 'home', 'Cupertino'],
    ]);
    // 4 + 0 + 2 + 1: the finals' goals, the scheduled game left out.
    expect(notes.goalsFor).toBe(7);
    expect(notes.warnings).toEqual([]);
  });

  it('credits a name on the other roster to the other team, and a name on both to neither', () => {
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

  it('counts only finals, never more goals or assists than the team scored, and reports what it leaves out', () => {
    const games = [
      noted(game({ home: 'homestead', away: 'fremont', date: '2026-10-28', status: 'scheduled' }), 'goals scored Emry Borges'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 0, date: '2026-09-30' }), 'goals scored Emry Borges, Sarah Anton'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 3, as: 0, date: '2026-10-01', forfeit: true }), 'goals scored Sarah Anton'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 2, as: 0, date: '2026-10-02' }), 'goals scored Emry Borges, Pat Nobody'),
      noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 0, date: '2026-10-03' }), 'Sarah Anton scored, Moll 2 assists'),
    ];
    const notes = noteStatsFor('homestead', sources(games));
    expect(notes.credits.map((c) => [c.dateKey, c.fullName, c.goals, c.assists])).toEqual([
      ['2026-10-02', 'Emry Borges', 1, 0],
      ['2026-10-03', 'Sarah Anton', 1, 0],
    ]);
    const w = notes.warnings.join('\n');
    expect(notes.warnings).toHaveLength(5);
    expect(w).toMatch(/game is not a final/);
    expect(w).toMatch(/game is a forfeit/);
    expect(w).toMatch(/credits 2 goals but Homestead scored 1/);
    expect(w).toMatch(/"Pat Nobody" is on neither roster/);
    expect(w).toMatch(/credits 2 assists but Homestead scored 1/);
  });
});

// ---------------------------------------------------------------- merging

/** Goal-scoring finals with no note, so the goals-scored cap is not what a test is about. */
function padding(goals: number): Game[] {
  return [noted(game({ home: 'homestead', away: 'lynbrook', hs: goals, as: 0, date: '2026-09-04' }), null)];
}

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

  it('adds assists at 1 point each, and tracks them when the coach does not', () => {
    const games = [...padding(8), noted(game({ home: 'homestead', away: 'fremont', hs: 1, as: 0, date: '2026-10-03' }), 'Goals: Moll from Anton')];
    const merged = withNoteStats(homesteadStats(), noteStatsFor('homestead', sources(games)));
    expect(merged.players.find((p) => p.fullName === 'Sarah Anton')!.field).toMatchObject({ goals: 1, assists: 1, points: 3 });
    expect(merged.players.find((p) => p.fullName === 'Gabrielle Moll')!.field).toMatchObject({ goals: 2, assists: null, points: 4 });
    expect(merged.tracked.field).toEqual(['gamesPlayed', 'goals', 'assists', 'points']);
    expect(merged.noteTracked.field).toEqual(['assists']);
  });

  it('adds none of a stat the coach also entered on MaxPreps for that game', () => {
    const team = homesteadStats();
    team.gameTotals = [
      { contestId: IDS.sf, goals: 0, assists: 0, saves: 5 },
      { contestId: IDS.fremont, goals: 2, assists: 0, saves: 0 },
      { contestId: IDS.cupertino, goals: 0, assists: 0, saves: 0 },
    ];
    const merged = withNoteStats(team, noteStatsFor('homestead', sources([...homesteadGames(), ...padding(8)])));
    expect(merged.noteCredits.map((c) => [c.dateKey, c.fullName, c.goals, c.saves])).toEqual([
      ['2026-10-05', 'Emry Borges', 1, 0],
    ]);
    expect(merged.warnings).toEqual([
      "2026-09-28 vs Saint Francis: MaxPreps has 5 saves entered for the game, so the note's are not added",
      "2026-09-30 vs Fremont: MaxPreps has 2 goals entered for the game, so the note's are not added",
    ]);
  });

  it('counts every note of a team with no MaxPreps stats at all: it entered nothing anywhere', () => {
    const blank: TeamPlayerStats = {
      ...homesteadStats(),
      status: 'none',
      players: [],
      tracked: { field: [], goalkeeping: [] },
      totals: { field: {}, goalkeeping: {} },
    };
    const merged = withNoteStats(blank, noteStatsFor('homestead', sources()));
    expect(merged.players.map((p) => [p.fullName, p.field?.goals ?? null, p.goalkeeping?.saves ?? null])).toEqual([
      ['Lacey Sebastian Carattini', null, 7],
      ['Gabrielle Moll', 1, null],
      ['Emry Borges', 2, null],
    ]);
    expect(merged.tracked).toEqual({ field: ['goals'], goalkeeping: ['saves'] });
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

// ---------------------------------------------------------------- MaxPreps' per-game totals

describe('parseGameStats', () => {
  const capture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'game-stats-homestead.json'), 'utf8')) as unknown;

  it("reads Homestead's capture: goals on Lynbrook and Los Altos, nothing on the noted games", () => {
    const rows = parseGameStats(capture, { expectedTeamId: getTeamBySlug('homestead')!.id });
    expect(rows).toHaveLength(11);
    expect(rows.filter((r) => r.goals > 0).map((r) => [r.contestId, r.goals])).toEqual([
      ['ed85ac7a-4f01-413a-86a2-7674922b90df', 3],
      ['5b12bb6f-b724-42ce-8c14-8b12882c1164', 1],
    ]);
    for (const id of ['4c02fa58-29a8-46d3-9820-2883a8c9d065', 'd6ec9aac-f2f7-482d-8a2e-3370cbf0c96d', 'fd403fcf-68d7-4105-b68e-cc19df94e580']) {
      expect(rows.find((r) => r.contestId === id)).toEqual({ contestId: id, goals: 0, assists: 0, saves: 0 });
    }
  });

  it("reads MaxPreps' no-data answer as nothing entered, and refuses another team's table", () => {
    expect(parseGameStats({ status: 400, message: 'No data was found for this request.', data: null })).toEqual([]);
    expect(() => parseGameStats({ status: 400, message: 'Bad request', data: null })).toThrow();
    expect(() => parseGameStats(capture, { expectedTeamId: getTeamBySlug('fremont')!.id })).toThrow(/teamId/);
    expect(contestIdFromUrl('https://www.maxpreps.com/ca/field-hockey/game/x/9-30-2026/?c=abc')).toBe('abc');
    expect(contestIdFromUrl(null)).toBeNull();
  });

  it('is read by scripts/fetch-player-stats.ts for the teams whose finals carry stat notes', () => {
    const file = buildFixturePlayerStats();
    const noted = teamsCreditedByNotes({ games: getSnapshot().games, roster: (slug) => getTeamRoster(slug)?.players });
    const homestead = file.teams.find((t) => t.slug === 'homestead')!;
    if (noted.has('homestead')) expect(homestead.gameTotals).toEqual(parseGameStats(capture));
    for (const t of file.teams) if (t.gameTotals) expect(noted.has(t.slug as TeamSlug), t.slug).toBe(true);
  });
});

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

  it('words assists alongside goals', () => {
    const games = [...padding(8), noted(game({ home: 'homestead', away: 'fremont', hs: 2, as: 0, date: '2026-10-03' }), 'Goals: Moll (2) from Anton')];
    const view = buildPlayerStatsView('homestead', [], withNoteStats(homesteadStats(), noteStatsFor('homestead', sources(games))))!;
    expect(view.notedGames.map((g) => g.added)).toEqual(['two goals for Gabrielle Moll and an assist for Sarah Anton']);
    expect(view.scoring!.rows.filter((r) => r.noted).map((r) => r.name)).toEqual(['Gabrielle Moll', 'Sarah Anton']);
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
  const committed = { games, roster: (slug: TeamSlug) => getTeamRoster(slug)?.players };

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
        // Never a stat the coach also entered for that game.
        const entered = team.gameTotals?.find((r) => r.contestId === c.contestId);
        for (const k of ['goals', 'assists', 'saves'] as const) if (entered && c[k] > 0) expect(entered[k], `${c.contestId} ${k}`).toBe(0);
      }
      // A team without notes keeps the footnote on goalkeeping figures as entered.
      if (team.noteCredits.length === 0) {
        const view = buildPlayerStatsView(team.slug as TeamSlug, [], team)!;
        expect(view.goalkeepingEntered, team.slug).toBe(view.goalies.length > 0);
      }
      // MaxPreps' goals plus the noted ones never pass the goals the team has scored.
      if (team.noteCredits.some((c) => c.goals > 0)) {
        expect(team.totals.field.goals!, team.slug).toBeLessThanOrEqual(noteStatsFor(team.slug as TeamSlug, committed).goalsFor);
      }
    }
  });

  it('holds per-game totals only for teams a game note credits', () => {
    const noted = teamsCreditedByNotes(committed);
    for (const t of getPlayerStats().teams) if (t.gameTotals) expect(noted.has(t.slug as TeamSlug), t.slug).toBe(true);
  });
});
