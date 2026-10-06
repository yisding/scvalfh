/**
 * Player stats a coach wrote in MaxPreps' game note instead of the stats sheet (SPEC §1.1k).
 *
 * MaxPreps' `contest.location` is a 50-character free-text note (lib/normalize.ts splitLocation),
 * and some coaches use it as a box score: Homestead's read "goals scored Gabby Molly, Emry Borges"
 * (Sep 30), "tied in OT 1:1  goal scored by Emery Borges" (Oct 5) and "Lacey played 3Q had 7
 * saves. Noa played last…" (Sep 28), while the team's MaxPreps stats held the same four one-goal
 * scorers from Sep 28 on and no goalkeeping at all. This module reads those notes and adds what
 * they say to the MaxPreps numbers, so the team page and /leaders count those goals and saves.
 *
 * Two kinds of statement are read, and nothing else:
 *   - goals: "goal(s) scored (by) A, B", "goal(s) by A", "goals: A (2), B", "scorers: …"; a name
 *     may carry a count, "(2)", "x2" or a trailing "2";
 *   - saves: "<Name> … N saves" (the clause starts with the keeper's name) or "N saves by <Name>".
 *
 * A name is credited only when it resolves to exactly one player on exactly one of the game's two
 * rosters (data/rosters.json): the full name, a curated alias (lib/name-aliases.ts), or a single
 * first or last name only one roster player has. Anything else is left out and reported, never
 * guessed.
 *
 * Guards, each reported in `warnings` when it drops something:
 *   - only finals count, and never a forfeit;
 *   - a game's note cannot credit a team with more goals than it scored in that game;
 *   - the MaxPreps goals plus every noted goal cannot exceed the goals the team has scored in all
 *     its finals. If it would, the coach has most likely entered some of the noted goals on
 *     MaxPreps since, so no noted goal is added for that team.
 * The stats file holds season totals only, so a note goal cannot be matched to a stats-sheet goal
 * one by one here; the third guard is what stops a double count. MaxPreps' per-game TEAM stats
 * (`team-season-game-stats/rollup/v1`, docs/DATA-SOURCES.md §1.1k) can: on 2026-10-06 Homestead's
 * four goals were entered on Lynbrook and Los Altos, and none on the three noted games.
 *
 * Points follow MaxPreps' rule, 2 per goal (lib/player-stats-schema.ts), on teams that track them.
 */

import { getSnapshot } from './data';
import { NAME_ALIASES, type NameAlias } from './name-aliases';
import { getPlayerStats, getTeamPlayerStats } from './player-stats';
import {
  FIELD_STAT_KEYS,
  GOALIE_STAT_KEYS,
  type FieldStats,
  type GoalieStats,
  type PlayerStatLine,
  type TeamPlayerStats,
} from './player-stats-schema';
import { getTeamRoster } from './rosters';
import type { Game, TeamSlug } from './types';

// ---------------------------------------------------------------- parsing

export interface NotedName {
  /** The name as the note writes it. */
  written: string;
  count: number;
}

export interface ParsedNote {
  goals: NotedName[];
  saves: NotedName[];
  /** Pieces that looked like a stat but could not be read as one. */
  unread: string[];
}

const NAME = /^[\p{L}][\p{L}'’.\- ]*$/u;

/** "goal scored by", "goals scored", "goals by", "goals:", "scorers:" — the rest of the clause lists names. */
const GOAL_LEAD = /\bgoals?\s+(?:scored\s+by|scored|by)\b\s*:?\s*|\b(?:goals?|scorers?)\s*:\s*/i;
/** "7 saves by Lacey", "7 saves for Lacey". */
const SAVES_BY = /\b(\d+)\s+saves?\s+(?:by|for|from)\s+(.+)$/i;
/** "had 7 saves", "7 saves". */
const SAVES = /\b(\d+)\s+saves?\b/i;
/** The capitalized words a clause opens with: "Lacey" in "Lacey played 3Q had 7 saves". */
const LEADING_NAME = /^([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})(?=\s|$)/u;

function clauses(note: string): string[] {
  return note
    .split(/(?<=[.;!?])\s+|\s{2,}|\s+[-–—|]\s+/)
    .map((c) => c.trim().replace(/[.;!?…]+$/, '').trim())
    .filter(Boolean);
}

/** "Emry Borges (2)" → 2 goals; "Emry Borges" → 1. null when the piece is not a name. */
function namedCount(piece: string): NotedName | null {
  const s = piece.trim().replace(/[.;!?…]+$/, '').trim();
  if (!s) return null;
  const m = /^(.*?)(?:\s*\(\s*(\d+)\s*\)|\s+[x×]\s*(\d+)|\s+(\d+))$/iu.exec(s);
  const written = (m ? m[1] : s).trim();
  const count = m ? Number(m[2] ?? m[3] ?? m[4]) : 1;
  if (!written || !NAME.test(written) || written.split(/\s+/).length > 4 || count < 1) return null;
  return { written, count };
}

/** Read the goals and saves a game note states. Pure; knows nothing of rosters. */
export function parseStatNote(note: string | null | undefined): ParsedNote {
  const out: ParsedNote = { goals: [], saves: [], unread: [] };
  if (!note) return out;
  for (const clause of clauses(note)) {
    const lead = GOAL_LEAD.exec(clause);
    if (lead) {
      const list = clause.slice(lead.index + lead[0].length);
      for (const piece of list.split(/\s*(?:,|&|\+|\band\b)\s*/i)) {
        if (!piece.trim()) continue;
        const named = namedCount(piece);
        if (named) out.goals.push(named);
        else out.unread.push(piece.trim());
      }
      continue;
    }
    for (const part of clause.split(/\s*(?:,|\band\b)\s*/i)) {
      const by = SAVES_BY.exec(part);
      if (by) {
        const named = namedCount(by[2]);
        if (named) out.saves.push({ written: named.written, count: Number(by[1]) });
        else out.unread.push(part);
        continue;
      }
      const saves = SAVES.exec(part);
      if (!saves) continue;
      const name = LEADING_NAME.exec(part);
      if (name) out.saves.push({ written: name[1], count: Number(saves[1]) });
      else out.unread.push(part);
    }
  }
  return out;
}

// ---------------------------------------------------------------- names

/** The roster fields a credit needs. */
export interface NoteRosterPlayer {
  athleteId: string | null;
  careerId: string | null;
  careerUrl: string | null;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  jersey: string | null;
}

export type NameMatch = 'roster' | 'alias' | 'first-name' | 'last-name';

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The one roster player a written name means, or null. A single word matches a first or last name
 * only when exactly one player on the roster has it.
 */
export function resolveName(
  written: string,
  team: TeamSlug,
  players: readonly NoteRosterPlayer[],
  aliases: readonly NameAlias[] = NAME_ALIASES,
): { player: NoteRosterPlayer; via: NameMatch } | null {
  const w = norm(written);
  const exact = players.filter((p) => norm(p.fullName) === w);
  if (exact.length === 1) return { player: exact[0], via: 'roster' };
  if (exact.length > 1) return null;
  const alias = aliases.find((a) => a.team === team && norm(a.written) === w);
  if (alias) {
    const hit = players.filter((p) => norm(p.fullName) === norm(alias.fullName));
    return hit.length === 1 ? { player: hit[0], via: 'alias' } : null;
  }
  if (w.includes(' ')) return null;
  const first = players.filter((p) => p.firstName && norm(p.firstName) === w);
  const last = players.filter((p) => p.lastName && norm(p.lastName) === w);
  if (first.length === 1 && last.length === 0) return { player: first[0], via: 'first-name' };
  if (last.length === 1 && first.length === 0) return { player: last[0], via: 'last-name' };
  return null;
}

// ---------------------------------------------------------------- credits per team

/** One player's line from one game's note. */
export interface NoteCredit {
  contestId: string;
  dateKey: string;
  /** The other side's name. */
  opponent: string;
  /** Where the credited team played: 'home', 'away' or 'neutral'. */
  site: 'home' | 'away' | 'neutral';
  /** The note as published (lib/normalize.ts may have marked a cut-off note with "…"). */
  note: string;
  written: string;
  via: NameMatch;
  athleteId: string | null;
  careerId: string | null;
  careerUrl: string | null;
  fullName: string;
  jersey: string | null;
  goals: number;
  saves: number;
}

export interface TeamNoteStats {
  slug: TeamSlug;
  credits: NoteCredit[];
  /** Goals scored in the team's finals, forfeits left out: the cap on MaxPreps plus noted goals. */
  goalsFor: number;
  warnings: string[];
}

export interface NoteSources {
  games: readonly Game[];
  /** A team's roster rows; undefined when the team has none. */
  roster: (slug: TeamSlug) => readonly NoteRosterPlayer[] | undefined;
  aliases?: readonly NameAlias[];
}

function defaultSources(): NoteSources {
  return {
    games: getSnapshot().games,
    roster: (slug) => getTeamRoster(slug)?.players,
  };
}

/** Every credit the notes on `slug`'s finals give its players. */
export function noteStatsFor(slug: TeamSlug, sources: NoteSources = defaultSources()): TeamNoteStats {
  const aliases = sources.aliases ?? NAME_ALIASES;
  const credits: NoteCredit[] = [];
  const warnings: string[] = [];
  let goalsFor = 0;

  const games = sources.games
    .filter((g) => g.home.slug === slug || g.away.slug === slug)
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));

  for (const g of games) {
    const side = g.home.slug === slug ? 'home' : 'away';
    const us = g[side];
    const final = g.status === 'final' && !g.isForfeit && us.score !== null;
    if (final) goalsFor += us.score!;

    const note = g.venue.text;
    const parsed = parseStatNote(note);
    if (!note || (parsed.goals.length === 0 && parsed.saves.length === 0 && parsed.unread.length === 0)) continue;
    const where = `${g.dateKey} ${g.away.name} at ${g.home.name}`;
    if (!final) {
      warnings.push(`${where}: the note names stats but the game is not a final, so none are counted: "${note}"`);
      continue;
    }
    for (const piece of parsed.unread) warnings.push(`${where}: could not read "${piece}" in the note "${note}"`);

    const ours: NoteCredit[] = [];
    const credit = (named: NotedName, kind: 'goals' | 'saves') => {
      // The note is the contest's, not one team's: a name counts for whichever roster it is on.
      const hits = (['home', 'away'] as const).flatMap((s) => {
        const teamSlug = g[s].slug;
        const players = teamSlug ? sources.roster(teamSlug) : undefined;
        const hit = teamSlug && players ? resolveName(named.written, teamSlug, players, aliases) : null;
        return hit ? [{ side: s, ...hit }] : [];
      });
      if (hits.length !== 1) {
        warnings.push(
          `${where}: "${named.written}" ${hits.length > 1 ? 'is on both rosters' : 'is on neither roster'}; not counted`,
        );
        return;
      }
      const [{ side: s, player, via }] = hits;
      if (s !== side) return; // the other team's player: credited when that team's stats are built
      const existing = ours.find((c) => c.athleteId === player.athleteId && c.fullName === player.fullName);
      const line =
        existing ??
        ({
          contestId: g.contestId,
          dateKey: g.dateKey,
          opponent: g[side === 'home' ? 'away' : 'home'].name,
          site: g.site === 'neutral' ? 'neutral' : side,
          note,
          written: named.written,
          via,
          athleteId: player.athleteId,
          careerId: player.careerId,
          careerUrl: player.careerUrl,
          fullName: player.fullName,
          jersey: player.jersey,
          goals: 0,
          saves: 0,
        } satisfies NoteCredit);
      line[kind] += named.count;
      if (!existing) ours.push(line);
    };
    for (const named of parsed.goals) credit(named, 'goals');
    for (const named of parsed.saves) credit(named, 'saves');

    const noted = ours.reduce((n, c) => n + c.goals, 0);
    if (noted > us.score!) {
      warnings.push(`${where}: the note credits ${noted} goals but ${us.name} scored ${us.score}; its goals are not counted`);
      for (const c of ours) c.goals = 0;
    }
    credits.push(...ours.filter((c) => c.goals > 0 || c.saves > 0));
  }
  return { slug, credits, goalsFor, warnings };
}

// ---------------------------------------------------------------- merging into MaxPreps' numbers

/** A team's MaxPreps stats with its noted goals and saves added, and the credits that were. */
export type NotedTeamPlayerStats = TeamPlayerStats & {
  /** What the notes added, one entry per player per game; empty when nothing was. */
  noteCredits: NoteCredit[];
  /** The stats `tracked` lists only because a note filled them: the coach enters none of them on MaxPreps. */
  noteTracked: TeamPlayerStats['tracked'];
};

const emptyField = (): FieldStats =>
  Object.fromEntries(FIELD_STAT_KEYS.map((k) => [k, null])) as FieldStats;
const emptyGoalie = (): GoalieStats =>
  Object.fromEntries(GOALIE_STAT_KEYS.map((k) => [k, null])) as GoalieStats;

/** "Emry Borges" → "E. Borges", the stats sheet's form. */
function shortNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : fullName;
}

/**
 * Add `notes` to `team`'s MaxPreps numbers. Pure: neither argument is changed. A player the stats
 * sheet does not list gets a line of their own, with only the noted stats filled.
 */
export function withNoteStats(team: TeamPlayerStats, notes: TeamNoteStats): NotedTeamPlayerStats {
  const warnings = [...team.warnings, ...notes.warnings];
  let credits = notes.credits;

  const maxprepsGoals =
    team.totals.field.goals ?? team.players.reduce((n, p) => n + (p.field?.goals ?? 0), 0);
  const notedGoals = credits.reduce((n, c) => n + c.goals, 0);
  if (notedGoals > 0 && maxprepsGoals + notedGoals > notes.goalsFor) {
    warnings.push(
      `game notes credit ${notedGoals} goals, but MaxPreps already has ${maxprepsGoals} of the ${notes.goalsFor} ` +
        'scored: some are probably entered there too, so no noted goal is added',
    );
    credits = credits.map((c) => ({ ...c, goals: 0 })).filter((c) => c.saves > 0);
  }
  if (credits.length === 0) return { ...team, warnings, noteCredits: [], noteTracked: { field: [], goalkeeping: [] } };

  const players: PlayerStatLine[] = team.players.map((p) => structuredClone(p));
  const field = new Set(team.tracked.field);
  const goalie = new Set(team.tracked.goalkeeping);
  const totals = structuredClone(team.totals);

  for (const c of credits) {
    let line = players.find(
      (p) => (c.careerId !== null && p.careerId === c.careerId) || (c.athleteId !== null && p.athleteId === c.athleteId),
    );
    if (!line) {
      line = {
        careerId: c.careerId,
        careerUrl: c.careerUrl,
        athleteId: c.athleteId,
        fullName: c.fullName,
        shortName: shortNameOf(c.fullName),
        jersey: c.jersey,
        onRoster: true,
        field: null,
        goalkeeping: null,
      };
      players.push(line);
    }
    if (c.goals > 0) {
      field.add('goals');
      line.field ??= emptyField();
      line.field.goals = (line.field.goals ?? 0) + c.goals;
      totals.field.goals = (totals.field.goals ?? 0) + c.goals;
      if (field.has('points')) {
        line.field.points = (line.field.points ?? 0) + 2 * c.goals;
        totals.field.points = (totals.field.points ?? 0) + 2 * c.goals;
      }
    }
    if (c.saves > 0) {
      goalie.add('saves');
      line.goalkeeping ??= emptyGoalie();
      line.goalkeeping.saves = (line.goalkeeping.saves ?? 0) + c.saves;
      totals.goalkeeping.saves = (totals.goalkeeping.saves ?? 0) + c.saves;
    }
  }

  return {
    ...team,
    tracked: {
      field: FIELD_STAT_KEYS.filter((k) => field.has(k)),
      goalkeeping: GOALIE_STAT_KEYS.filter((k) => goalie.has(k)),
    },
    totals,
    players,
    warnings,
    noteCredits: credits,
    noteTracked: {
      field: FIELD_STAT_KEYS.filter((k) => field.has(k) && !team.tracked.field.includes(k)),
      goalkeeping: GOALIE_STAT_KEYS.filter((k) => goalie.has(k) && !team.tracked.goalkeeping.includes(k)),
    },
  };
}

// ---------------------------------------------------------------- read API

/** `slug`'s MaxPreps stats with its game notes added; undefined for a slug that is no team. */
export function getTeamPlayerStatsWithNotes(slug: TeamSlug): NotedTeamPlayerStats | undefined {
  const team = getTeamPlayerStats(slug);
  return team ? withNoteStats(team, noteStatsFor(slug)) : undefined;
}

/** Every team's MaxPreps stats with its game notes added, in the file's order. */
export function getAllPlayerStatsWithNotes(): NotedTeamPlayerStats[] {
  const sources = defaultSources();
  return getPlayerStats().teams.map((t) => withNoteStats(t, noteStatsFor(t.slug, sources)));
}
