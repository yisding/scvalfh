/**
 * Player stats a coach wrote in MaxPreps' game note instead of the stats sheet (SPEC §1.1k), for
 * every registry team.
 *
 * MaxPreps' `contest.location` is a 50-character free-text note (lib/normalize.ts splitLocation),
 * and some coaches use it as a box score: Homestead's read "goals scored Gabby Molly, Emry Borges"
 * (Sep 30), "tied in OT 1:1  goal scored by Emery Borges" (Oct 5) and "Lacey played 3Q had 7
 * saves. Noa played last…" (Sep 28). This module reads those notes on any team's finals and adds
 * what they say to the MaxPreps numbers, so the team page and /leaders count them.
 *
 * What is read — goals, assists and saves, nothing else:
 *   - a list after a lead-in: "goal(s) scored (by) A, B", "goals by/from …", "goals: A (2), B",
 *     "scorers: …", "assists: …"; a goal may name its assist: "A from B", "A (assist B)";
 *   - a statement per comma-separated piece: "A scored", "A scored twice", "A scored 2 goals",
 *     "A 2 goals", "A had a goal", "A with two assists", "A hat trick", "hat trick for A";
 *   - saves: "<Name> … N saves" (the piece opens with the keeper's name) or "N saves by <Name>".
 * A count is a digit, a word up to five, "twice" or "hat trick" (3). A piece that mentions goals,
 * assists, saves or scoring but fits none of these is reported, never guessed at.
 *
 * Names (resolveName). A name is credited only when it resolves to exactly one player on exactly
 * one of the game's two rosters (data/rosters.json): the full name; a curated alias
 * (lib/name-aliases.ts); a full name whose first name is a common nickname of the roster's
 * ("Gabby" for Gabrielle), or either half one letter off ("Emery" for Emry, "Molly" for Moll), or
 * whose last name is the last word of a longer one; or a lone first or last name only one roster
 * player has. Anything else is left out and reported.
 *
 * Guards, each reported in `warnings` when it drops something:
 *   - only finals count, and never a forfeit;
 *   - a game's note cannot credit a team with more goals than it scored in that game;
 *   - a noted game whose goals, assists or saves the coach has ALSO entered on MaxPreps (the
 *     team's per-game totals, `gameTotals`, read by scripts/fetch-player-stats.ts for every team
 *     a note credits: teamsCreditedByNotes) adds none of that stat: it is on the sheet already;
 *   - a noted game whose entries cannot be checked (the per-game read failed or does not list the
 *     game) adds nothing: unverified is not counted. A team with no MaxPreps stats at all (status
 *     'none') entered nothing, so its notes need no check;
 *   - the MaxPreps goals plus every noted goal cannot exceed the goals the team has scored in all
 *     its finals. If it would, no noted goal is added for that team.
 *
 * Points follow MaxPreps' rule, 2 per goal and 1 per assist (lib/player-stats-schema.ts), on teams
 * that track them.
 *
 * Pure: everything it reads is passed in, so scripts/fetch-player-stats.ts can use it without
 * loading the files it is about to write. lib/player-stats.ts wires it to the committed data.
 */

import { NAME_ALIASES, type NameAlias } from './name-aliases';
import {
  FIELD_STAT_KEYS,
  GOALIE_STAT_KEYS,
  type FieldStats,
  type GoalieStats,
  type PlayerStatLine,
  type TeamPlayerStats,
} from './player-stats-schema';
import type { Game, TeamSlug } from './types';

// ---------------------------------------------------------------- parsing

export type NoteStatKind = 'goals' | 'assists' | 'saves';
export const NOTE_STAT_KINDS: readonly NoteStatKind[] = ['goals', 'assists', 'saves'];

export interface NotedName {
  /** The name as the note writes it. */
  written: string;
  count: number;
}

export interface ParsedNote {
  goals: NotedName[];
  assists: NotedName[];
  saves: NotedName[];
  /** Pieces that mention a stat but could not be read as one. */
  unread: string[];
}

const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, twice: 2 };
const COUNT = String.raw`(\d+|an?|one|two|three|four|five)`;

function countOf(raw: string | undefined): number {
  if (!raw) return 1;
  const s = raw.trim().toLowerCase();
  return /^\d+$/.test(s) ? Number(s) : (COUNT_WORDS[s] ?? 1);
}

/** Letters, spaces, apostrophes, periods and hyphens; at most four words. */
function isName(s: string): boolean {
  return /^[\p{L}][\p{L}'’.\- ]*$/u.test(s) && s.trim().split(/\s+/).length <= 4;
}

/** "A and B" → [A, B]. */
function splitNames(s: string): string[] {
  return s.split(/\s*(?:&|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
}

/** A piece that talks about stats, whether or not it can be read. */
const STAT_WORDS = /\b(?:goals?|assists?|saves?|scored|scorers?|hat[\s-]?trick)\b/i;

/** "goal scored by", "goals scored", "goals by", "goals:", "scorers:", "goal -" — a list of scorers follows. */
const GOAL_LEAD = /\bgoals?\s+(?:scored\s+by|scored|by|from)\b\s*:?\s*|\b(?:goals?|scorers?)\s*[:\-–]\s*/i;
/** "assists:", "assists by", "assist -" — a list of assisters follows. */
const ASSIST_LEAD = /\bassists?\s+(?:by|from)\b\s*:?\s*|\bassists?\s*[:\-–]\s*/i;
/** Inside a scorer list: "A from B", "A (assist B)", "A, assisted by B". */
const ASSIST_TAIL = /\s*\(?\s*(?:assisted\s+by|assist(?:\s+by)?|ast\.?|from)\s+([^)]+?)\s*\)?$/i;

/** "Emry Borges (2)", "Emry Borges x2", "Emry Borges 2" → a count; else 1. null when not a name. */
function namedCount(piece: string): NotedName | null {
  const s = piece.trim().replace(/[.;!?…]+$/, '').trim();
  if (!s) return null;
  const m = /^(.*?)(?:\s*\(\s*(\d+)\s*\)|\s+[x×]\s*(\d+)|\s+(\d+))$/iu.exec(s);
  const written = (m ? m[1] : s).trim();
  const count = m ? Number(m[2] ?? m[3] ?? m[4]) : 1;
  if (!written || !isName(written) || count < 1) return null;
  return { written, count };
}

/** One statement per piece: [kind, names, count] when the piece is one. */
const STATEMENTS: Array<{ re: RegExp; kind: NoteStatKind; name: number; count?: number; fixed?: number }> = [
  // "A scored", "A scored twice", "A scored 2", "A scored two goals", "A scored a hat trick"
  { re: /^(.+?)\s+(?:scored|netted)(?:\s+a\s+hat[\s-]?trick)$/i, kind: 'goals', name: 1, fixed: 3 },
  { re: new RegExp(String.raw`^(.+?)\s+(?:scored|netted)(?:\s+${COUNT.replace('|one', '|twice|one')}(?:\s+goals?)?)?$`, 'i'), kind: 'goals', name: 1, count: 2 },
  // "A 2 goals", "A had a goal", "A with two goals", "A - 2 goals"
  { re: new RegExp(String.raw`^(.+?)\s+(?:had\s+|with\s+|added\s+|got\s+|[-–:]\s*)?${COUNT}\s+goals?$`, 'i'), kind: 'goals', name: 1, count: 2 },
  // "A hat trick", "A had a hat trick", "hat trick for A"
  { re: /^(.+?)\s+(?:had\s+|with\s+|got\s+)?(?:a\s+)?hat[\s-]?trick$/i, kind: 'goals', name: 1, fixed: 3 },
  { re: /^hat[\s-]?trick\s+(?:for|by)\s+(.+)$/i, kind: 'goals', name: 1, fixed: 3 },
  // "A 2 assists", "A had an assist", "A with two assists"
  { re: new RegExp(String.raw`^(.+?)\s+(?:had\s+|with\s+|added\s+|got\s+|[-–:]\s*)?${COUNT}\s+assists?$`, 'i'), kind: 'assists', name: 1, count: 2 },
  // "7 saves by Lacey"
  { re: /^(\d+)\s+saves?\s+(?:by|for|from)\s+(.+)$/i, kind: 'saves', name: 2, count: 1 },
];

/** The capitalized words a piece opens with: "Lacey" in "Lacey played 3Q had 7 saves". */
const LEADING_NAME = /^([\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*){0,2})(?=\s|$)/u;
const SAVES = /\b(\d+)\s+saves?\b/i;

function clauses(note: string): string[] {
  return note
    .split(/(?<=[.;!?])\s+|\s{2,}/)
    .map((c) => c.trim().replace(/[.;!?…]+$/, '').trim())
    .filter(Boolean);
}

function readList(list: string, kind: 'goals' | 'assists', out: ParsedNote): void {
  for (const raw of list.split(/\s*(?:,|&|\+|\band\b)\s*(?![^(]*\))/i)) {
    const piece = raw.trim();
    if (!piece) continue;
    const tail = kind === 'goals' ? ASSIST_TAIL.exec(piece) : null;
    const scorer = namedCount(tail ? piece.slice(0, tail.index) : piece);
    if (!scorer) {
      out.unread.push(piece);
      continue;
    }
    out[kind].push(scorer);
    if (tail) {
      const helper = namedCount(tail[1]);
      if (helper) out.assists.push({ written: helper.written, count: 1 });
      else out.unread.push(tail[1]);
    }
  }
}

/** One comma-separated piece outside a list. true when it was read as a stat. */
function readPiece(piece: string, out: ParsedNote): boolean {
  for (const s of STATEMENTS) {
    const m = s.re.exec(piece);
    if (!m) continue;
    const names = splitNames(m[s.name]);
    if (names.length === 0 || !names.every(isName)) continue;
    const count = s.fixed ?? (s.count ? countOf(m[s.count]) : 1);
    for (const written of names) out[s.kind].push({ written, count });
    return true;
  }
  const saves = SAVES.exec(piece);
  const name = saves ? LEADING_NAME.exec(piece) : null;
  if (saves && name) {
    out.saves.push({ written: name[1], count: Number(saves[1]) });
    return true;
  }
  return false;
}

/** Read the goals, assists and saves a game note states. Pure; knows nothing of rosters. */
export function parseStatNote(note: string | null | undefined): ParsedNote {
  const out: ParsedNote = { goals: [], assists: [], saves: [], unread: [] };
  if (!note) return out;
  for (const clause of clauses(note)) {
    const goal = GOAL_LEAD.exec(clause);
    const assist = ASSIST_LEAD.exec(clause);
    // The first lead-in decides: what is before it is pieces, what is after it a list (up to the
    // other lead-in, when both appear: "goals: A, B; assists: C" is two clauses already).
    const lead = goal && (!assist || goal.index <= assist.index) ? { m: goal, kind: 'goals' as const } : assist ? { m: assist, kind: 'assists' as const } : null;
    const before = lead ? clause.slice(0, lead.m.index) : clause;
    for (const raw of before.split(/\s*,\s*/)) {
      const piece = raw.trim();
      if (!piece) continue;
      // "A 4 saves and B 2 saves": each half a statement of its own. "A and B scored" is one.
      const halves = piece.split(/\s+and\s+/i);
      if (halves.length > 1 && halves.every((h) => readPiece(h, { goals: [], assists: [], saves: [], unread: [] }))) {
        for (const h of halves) readPiece(h, out);
        continue;
      }
      if (!readPiece(piece, out) && STAT_WORDS.test(piece)) out.unread.push(piece);
    }
    if (lead) {
      let list = clause.slice(lead.m.index + lead.m[0].length);
      const other = lead.kind === 'goals' ? ASSIST_LEAD.exec(list) : GOAL_LEAD.exec(list);
      if (other) {
        readList(list.slice(other.index + other[0].length), lead.kind === 'goals' ? 'assists' : 'goals', out);
        list = list.slice(0, other.index);
      }
      readList(list.replace(/[,;\s]+$/, ''), lead.kind, out);
    }
  }
  return out;
}

/** Does this note state any goal, assist or save? */
export function hasStats(parsed: ParsedNote): boolean {
  return NOTE_STAT_KINDS.some((k) => parsed[k].length > 0);
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

export type NameMatch = 'roster' | 'alias' | 'nickname' | 'near-spelling' | 'partial' | 'first-name' | 'last-name';

/**
 * Common short forms of given names, each mapped to the full names it stands for. Matching goes
 * both ways (a note's "Gabby" finds a roster's Gabrielle, a note's "Gabrielle" a roster's Gabby),
 * and two short forms of one name match each other ("Maddie" and "Madi").
 */
const NICKNAMES: Record<string, readonly string[]> = {
  abby: ['abigail'], abbie: ['abigail'], abbey: ['abigail'],
  addie: ['addison', 'adelaide', 'adeline'], addy: ['addison', 'adelaide', 'adeline'],
  alex: ['alexandra', 'alexa', 'alexis', 'alexandria'], lexi: ['alexandra', 'alexis', 'alexa'], lexie: ['alexandra', 'alexis', 'alexa'],
  ally: ['allison', 'alison', 'alexandra', 'alyssa'], allie: ['allison', 'alison', 'alexandra', 'alyssa'], ali: ['allison', 'alison', 'alexandra', 'alyssa'],
  annie: ['anna', 'ann', 'anne', 'annabel', 'annabelle'],
  becca: ['rebecca'], becky: ['rebecca'],
  bella: ['isabella', 'isabel', 'isabelle', 'annabella', 'arabella'], izzy: ['isabella', 'isabel', 'isabelle'], izzie: ['isabella', 'isabel', 'isabelle'],
  cat: ['catherine', 'katherine', 'kathryn', 'caitlin'], kat: ['katherine', 'kathryn', 'catherine'],
  kate: ['katherine', 'kathryn', 'catherine', 'kaitlyn'], katie: ['katherine', 'kathryn', 'catherine', 'kaitlyn'], kathy: ['katherine', 'kathryn', 'catherine'],
  cece: ['cecilia', 'cecelia'], charlie: ['charlotte'], callie: ['caroline', 'calista'], caro: ['caroline', 'carolina'],
  ella: ['eleanor', 'elena', 'gabriella', 'isabella', 'ellen'], ellie: ['eleanor', 'elizabeth', 'ellen', 'elena', 'eliana'],
  liz: ['elizabeth'], lizzie: ['elizabeth'], lizzy: ['elizabeth'], beth: ['elizabeth', 'bethany'], libby: ['elizabeth'], eliza: ['elizabeth'], betsy: ['elizabeth'],
  em: ['emma', 'emily', 'emerson', 'emilia'], emmy: ['emma', 'emily', 'emilia'],
  gabby: ['gabrielle', 'gabriella'], gabbi: ['gabrielle', 'gabriella'], gabbie: ['gabrielle', 'gabriella'], gabi: ['gabrielle', 'gabriella'], gaby: ['gabrielle', 'gabriella'],
  jen: ['jennifer'], jenny: ['jennifer'], jess: ['jessica'], jessie: ['jessica'], josie: ['josephine'],
  kenzie: ['mackenzie', 'mckenzie'],
  maddie: ['madison', 'madeline', 'madelyn', 'madeleine'], maddy: ['madison', 'madeline', 'madelyn', 'madeleine'], madi: ['madison', 'madeline', 'madelyn'],
  mandy: ['amanda'], meg: ['megan', 'margaret'], maggie: ['margaret', 'magdalena'],
  nat: ['natalie', 'natalia'], nikki: ['nicole', 'nicola'], liv: ['olivia'], livvy: ['olivia'], livi: ['olivia'],
  rosie: ['rose', 'rosalind', 'rosemary'], sam: ['samantha'], sammy: ['samantha'], sophie: ['sophia'],
  steph: ['stephanie'], tori: ['victoria'], vicky: ['victoria'], val: ['valerie', 'valentina'], andie: ['andrea'],
};

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The full names a given name can stand for, itself included. */
function givenForms(name: string): Set<string> {
  const out = new Set([name, ...(NICKNAMES[name] ?? [])]);
  for (const [short, full] of Object.entries(NICKNAMES)) if (full.includes(name)) out.add(short);
  return out;
}

/** At most one letter added, dropped or changed: "emery"/"emry", "molly"/"moll". */
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const rest = (x: string, skip: number) => x.slice(i + skip);
  return a.length === b.length
    ? rest(a, 1) === rest(b, 1)
    : a.length > b.length
      ? rest(a, 1) === rest(b, 0)
      : rest(a, 0) === rest(b, 1);
}

/** Short names are too easy to mistype into someone else's: one-letter tolerance needs 4 letters. */
const near = (a: string, b: string) => a.length >= 4 && b.length >= 4 && oneEditApart(a, b);

type PartMatch = 'exact' | 'nickname' | 'near' | 'partial' | null;

function firstMatch(written: string, roster: string): PartMatch {
  if (written === roster) return 'exact';
  const forms = givenForms(written);
  if (forms.has(roster) || [...givenForms(roster)].some((f) => forms.has(f))) return 'nickname';
  return near(written, roster) ? 'near' : null;
}

function lastMatch(written: string, roster: string): PartMatch {
  if (written === roster) return 'exact';
  const words = roster.split(' ');
  if (words.length > 1 && (words.at(-1) === written || words[0] === written)) return 'partial';
  return near(written, roster) ? 'near' : null;
}

/**
 * The one roster player a written name means, or null. See the module comment for the rules; a
 * rule that finds two players finds none.
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
  const words = w.split(' ');
  if (words.length === 1) {
    const first = players.filter((p) => p.firstName && norm(p.firstName) === w);
    const last = players.filter((p) => p.lastName && norm(p.lastName) === w);
    if (first.length === 1 && last.length === 0) return { player: first[0], via: 'first-name' };
    if (last.length === 1 && first.length === 0) return { player: last[0], via: 'last-name' };
    return null;
  }
  const [givenWritten, familyWritten] = [words[0], words.slice(1).join(' ')];
  const hits = players.flatMap((p) => {
    if (!p.firstName || !p.lastName) return [];
    const f = firstMatch(givenWritten, norm(p.firstName));
    const l = lastMatch(familyWritten, norm(p.lastName));
    if (!f || !l) return [];
    const parts = [f, l];
    const via: NameMatch = parts.includes('nickname') ? 'nickname' : parts.includes('near') ? 'near-spelling' : 'partial';
    return [{ player: p, via }];
  });
  return hits.length === 1 ? hits[0] : null;
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
  assists: number;
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

const total = (c: Pick<NoteCredit, NoteStatKind>) => c.goals + c.assists + c.saves;

/**
 * The teams whose players a game note on a final credits: the ones whose per-game MaxPreps totals
 * scripts/fetch-player-stats.ts reads, to tell whether those stats are on the sheet already.
 */
export function teamsCreditedByNotes(sources: NoteSources): Set<TeamSlug> {
  const sides = new Set<TeamSlug>();
  for (const g of sources.games) {
    if (g.status !== 'final' || g.isForfeit || !hasStats(parseStatNote(g.venue.text))) continue;
    for (const side of [g.home, g.away]) if (side.slug) sides.add(side.slug);
  }
  return new Set([...sides].filter((slug) => noteStatsFor(slug, sources).credits.length > 0));
}

/** Every credit the notes on `slug`'s finals give its players. */
export function noteStatsFor(slug: TeamSlug, sources: NoteSources): TeamNoteStats {
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
    if (!note || (!hasStats(parsed) && parsed.unread.length === 0)) continue;
    const where = `${g.dateKey} ${g.away.name} at ${g.home.name}`;
    if (!final) {
      const why = g.isForfeit ? 'a forfeit' : 'not a final';
      warnings.push(`${where}: the note names stats but the game is ${why}, so none are counted: "${note}"`);
      continue;
    }
    for (const piece of parsed.unread) warnings.push(`${where}: could not read "${piece}" in the note "${note}"`);

    const ours: NoteCredit[] = [];
    const credit = (named: NotedName, kind: NoteStatKind) => {
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
          assists: 0,
          saves: 0,
        } satisfies NoteCredit);
      line[kind] += named.count;
      if (!existing) ours.push(line);
    };
    for (const kind of NOTE_STAT_KINDS) for (const named of parsed[kind]) credit(named, kind);

    const noted = ours.reduce((n, c) => n + c.goals, 0);
    if (noted > us.score!) {
      warnings.push(`${where}: the note credits ${noted} goals but ${us.name} scored ${us.score}; its goals are not counted`);
      for (const c of ours) c.goals = 0;
    }
    // Every assist is on a goal: no more of them than goals scored either.
    const assists = ours.reduce((n, c) => n + c.assists, 0);
    if (assists > us.score!) {
      warnings.push(`${where}: the note credits ${assists} assists but ${us.name} scored ${us.score}; its assists are not counted`);
      for (const c of ours) c.assists = 0;
    }
    credits.push(...ours.filter((c) => total(c) > 0));
  }
  return { slug, credits, goalsFor, warnings };
}

// ---------------------------------------------------------------- merging into MaxPreps' numbers

/** A team's MaxPreps stats with its noted goals, assists and saves added, and the credits that were. */
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
 * Which of a player's numbers include a game note's, on a team withNoteStats built; empty for a
 * team without notes. A note's saves cover games the coach's goals against and shots on goal do
 * not, so no figure may be worked out from both (Save %, the shots-on-goal check).
 */
export function notedKinds(
  team: TeamPlayerStats & { noteCredits?: readonly NoteCredit[] },
  p: Pick<PlayerStatLine, 'careerId' | 'athleteId'>,
): Set<NoteStatKind> {
  const mine = (team.noteCredits ?? []).filter(
    (c) => (p.careerId !== null && c.careerId === p.careerId) || (p.athleteId !== null && c.athleteId === p.athleteId),
  );
  return new Set(NOTE_STAT_KINDS.filter((k) => mine.some((c) => c[k] > 0)));
}

const STAT_WORD: Record<NoteStatKind, string> = { goals: 'goals', assists: 'assists', saves: 'saves' };

/**
 * What the coach entered on MaxPreps for each noted game, when it is known: a team with no stats
 * at all entered nothing, a team whose per-game totals were read entered what they say. null when
 * it is not known (the per-game read failed, or never covered the game): nothing is added then,
 * since a noted stat that may be on the sheet already cannot be told from one that is not.
 */
function enteredFor(team: TeamPlayerStats, contestId: string): Record<NoteStatKind, number> | null {
  if (team.status === 'none') return { goals: 0, assists: 0, saves: 0 };
  return team.gameTotals?.find((r) => r.contestId === contestId) ?? null;
}

/**
 * Add `notes` to `team`'s MaxPreps numbers. Pure: neither argument is changed. A player the stats
 * sheet does not list gets a line of their own, with only the noted stats filled.
 */
export function withNoteStats(team: TeamPlayerStats, notes: TeamNoteStats): NotedTeamPlayerStats {
  const warnings = [...team.warnings, ...notes.warnings];
  let credits = notes.credits.map((c) => ({ ...c }));

  // A noted game whose stat the coach entered on the sheet as well adds none of it, and one whose
  // entries cannot be checked adds nothing at all.
  for (const c of credits) {
    const entered = enteredFor(team, c.contestId);
    if (!entered) {
      const unknown = `${c.dateKey} vs ${c.opponent}: what MaxPreps has entered for the game could not be read`;
      if (!warnings.some((w) => w.startsWith(unknown))) warnings.push(`${unknown}, so the note's stats are not added`);
      for (const kind of NOTE_STAT_KINDS) c[kind] = 0;
      continue;
    }
    for (const kind of NOTE_STAT_KINDS) {
      if (c[kind] === 0 || entered[kind] === 0) continue;
      const already = `${c.dateKey} vs ${c.opponent}: MaxPreps has ${entered[kind]} ${STAT_WORD[kind]} entered for the game`;
      if (!warnings.some((w) => w.startsWith(already))) warnings.push(`${already}, so the note's are not added`);
      c[kind] = 0;
    }
  }
  credits = credits.filter((c) => total(c) > 0);

  const maxprepsGoals =
    team.totals.field.goals ?? team.players.reduce((n, p) => n + (p.field?.goals ?? 0), 0);
  const notedGoals = credits.reduce((n, c) => n + c.goals, 0);
  if (notedGoals > 0 && maxprepsGoals + notedGoals > notes.goalsFor) {
    warnings.push(
      `game notes credit ${notedGoals} goals, but MaxPreps already has ${maxprepsGoals} of the ${notes.goalsFor} ` +
        'scored: some are probably entered there too, so no noted goal is added',
    );
    credits = credits.map((c) => ({ ...c, goals: 0 })).filter((c) => total(c) > 0);
  }
  if (credits.length === 0) return { ...team, warnings, noteCredits: [], noteTracked: { field: [], goalkeeping: [] } };

  const players: PlayerStatLine[] = team.players.map((p) => structuredClone(p));
  const field = new Set(team.tracked.field);
  const goalie = new Set(team.tracked.goalkeeping);
  const totals = structuredClone(team.totals);
  const addField = (line: PlayerStatLine, key: 'goals' | 'assists' | 'points', n: number) => {
    line.field ??= emptyField();
    line.field[key] = (line.field[key] ?? 0) + n;
    totals.field[key] = (totals.field[key] ?? 0) + n;
  };

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
      addField(line, 'goals', c.goals);
      if (field.has('points')) addField(line, 'points', 2 * c.goals);
    }
    if (c.assists > 0) {
      field.add('assists');
      addField(line, 'assists', c.assists);
      if (field.has('points')) addField(line, 'points', c.assists);
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
