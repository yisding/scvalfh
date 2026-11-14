import { EN_DASH, leagueClock, leagueClockPT, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { getTeamById } from '../../lib/teams';
import { winningSide } from '../../lib/postseason/game-winner';
import type { CcsPlayoffs, ContestId, Game, TournamentBracket, TournamentBracketMatchup, TournamentBracketSide } from '../../lib/types';

/**
 * The published brackets of `playoffs.brackets` (lib/types.ts TournamentBracket: MaxPreps' tournament pages read
 * whole by lib/sources/maxpreps-tournament.ts) as the rounds the site's one drawer draws (components/playoffs/
 * Bracket.tsx), one bracket per division (2026-11-14). Pure, so tests/ui/tournament-brackets-view.test.ts reads
 * every word it prints.
 *
 * WHICH BRACKETS. A division with a team of ours in it: the site covers its leagues' schools, and other teams
 * appear only as opponents. The CIF State divisions come first (the later stage, and the one still being played
 * once it exists), then the CCS divisions, each in division order. A CCS division with none of our teams is named
 * in `ccsOthers`, for one sentence that sends the reader to the official bracket.
 *
 * THE TREE. A bracket is its matchups joined by `next` and each side's `from`; nothing is read off a round's
 * position on the page. The rounds are the levels of the tree walked back from the last game, each level in
 * the order its games feed the next, so the connectors the drawer draws are true. A CIF State bracket is two
 * regionals and a state final: only the regional our teams are in is drawn (sixteen teams, not thirty-two), then
 * the state final. When both regionals hold a team of ours the whole tree is drawn.
 *
 * A BYE is no cell: its team is listed under the round it skips ("Byes: Salinas (1), …"), as the San Diego
 * brackets list theirs.
 *
 * A CELL keeps the page's side order (the upper side is the one the upper feeding game sends), prints a registry
 * team by its short name and any other school by MaxPreps' name, the seed MaxPreps prints, and what the page
 * gives as each side's result (sets won, for volleyball). A side not decided yet names the two teams that can
 * reach it ("Los Altos or Burlingame") or `TBD`. A game the snapshot holds (one of ours) links to its game page;
 * an unplayed one carries its start time, its site and its ticket and stream links. Nothing is inferred: a game
 * whose day has passed with no result says "No result posted yet".
 *
 * WHEN THE PAGE IS BEHIND. The tournament page and the team feeds are two reads, and a bracket can be the previous
 * run's copy. Where the snapshot's own game is final and the page has no result for it yet, the cell prints the
 * game's result (`resolve`), so /playoffs never contradicts the game page it links to. And a CCS bracket game no
 * stored bracket holds (the page failed with nothing to carry, a division that did not parse) is not dropped:
 * `uncoveredBracketGames` gives them to the by-round paths (components/playoffs/bracket-model.ts) the page draws
 * under the brackets.
 */

export interface TournamentTieLine {
  slug: string | null;
  name: string;
  seed: number | null;
  /** A decided game's figure; null when the page posted none (the cell prints the missing-score dash). */
  score?: number | null;
  result: 'won' | 'lost' | null;
  open: boolean;
}

export interface TournamentTie {
  key: string;
  /** The anchor a game's "Bracket" link lands on (components/playoffs/bracket-link.ts). */
  id: string;
  state: 'final' | 'upcoming' | null;
  lines: [TournamentTieLine, TournamentTieLine];
  time: string | null;
  note: string | null;
  links: Array<{ href: string; label: string }>;
  href: string | null;
  contestId: ContestId | null;
  /** The joined game's seeds, by its own away and home sides (the bracket link's); null with no game. */
  gameSeeds: { away: number | null; home: number | null } | null;
  sentence: string;
}

export interface TournamentRound {
  key: string;
  name: string;
  dateLabel: string;
  ties: TournamentTie[];
  byes: string | null;
}

export interface TournamentBracketView {
  /** 'cif-division-iii', 'ccs-open-division': the section's id on /playoffs. */
  id: string;
  event: TournamentBracket['event'];
  /** 'CIF State Division III', 'CCS Open Division'. */
  name: string;
  /** The jump row's words: 'CIF Division III', 'CCS Open'. */
  nav: string;
  /** '13 teams', 'NorCal regional, 16 teams'. */
  meta: string;
  url: string;
  rounds: TournamentRound[];
}

export interface TournamentBracketsView {
  /** CIF State divisions first, then the CCS divisions. */
  brackets: TournamentBracketView[];
  /** The CCS divisions on the page that hold none of our teams: 'Division 4', 'Division 5'. */
  ccsOthers: string[];
}

const EVENT_NAME: Record<TournamentBracket['event'], { full: string; short: string; link: string }> = {
  ccs: { full: 'CCS', short: 'CCS', link: 'CCS bracket' },
  cif: { full: 'CIF State', short: 'CIF', link: 'CIF State bracket' },
};

/** The label of a game's link to its bracket: 'CCS bracket', 'CIF State bracket'. */
export function bracketLinkLabel(event: TournamentBracket['event']): string {
  return EVENT_NAME[event].link;
}

function slugOf(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** MaxPreps' round names in the site's words: 'First round', 'Quarterfinals', 'Semifinals', 'Final'. */
export function roundName(raw: string, games: number): string {
  const name = raw.trim();
  if (/^(1st|first)\s+round$/i.test(name) || /^round\s+(i|1|one)$/i.test(name)) return 'First round';
  if (/^(2nd|second)\s+round$/i.test(name) || /^round\s+(ii|2|two)$/i.test(name)) return 'Second round';
  if (/^quarter\s*-?\s*finals?$/i.test(name)) return 'Quarterfinals';
  if (/^semi\s*-?\s*finals?$/i.test(name)) return 'Semifinals';
  if (/^regional\s+finals?$/i.test(name)) return games === 1 ? 'Regional final' : 'Regional finals';
  if (/^state\s+finals?$/i.test(name)) return 'State final';
  if (/^(finals?|championship)$/i.test(name)) return 'Final';
  return name;
}

function isOurs(side: TournamentBracketSide): boolean {
  return side.teamId !== null && getTeamById(side.teamId) !== undefined;
}

function holdsOurs(matchups: readonly TournamentBracketMatchup[]): boolean {
  return matchups.some((m) => m.sides.some(isOurs));
}

/** The matchups of the tree under `root`, level by level from `root` back to the opening round. */
function levelsFrom(root: TournamentBracketMatchup, byId: ReadonlyMap<string, TournamentBracketMatchup>): TournamentBracketMatchup[][] {
  const levels: TournamentBracketMatchup[][] = [];
  const seen = new Set<string>();
  let level = [root];
  while (level.length > 0) {
    for (const m of level) seen.add(m.id);
    levels.push(level);
    level = level
      .flatMap((m) => m.sides.map((s) => (s.from === null ? undefined : byId.get(s.from))))
      .filter((m): m is TournamentBracketMatchup => m !== undefined && !seen.has(m.id));
  }
  return levels;
}

/** What a side prints: the registry's short name for a team of ours, MaxPreps' name for any other school. */
function teamName(side: TournamentBracketSide): string {
  const team = side.teamId === null ? undefined : getTeamById(side.teamId);
  return team?.shortName ?? side.name ?? 'TBD';
}

/** 'Homestead (3)': a team inside a sentence, with the seed MaxPreps prints. */
function teamWords(side: TournamentBracketSide): string {
  return side.seed === null ? teamName(side) : `${teamName(side)} (${side.seed})`;
}

/** A side still to be decided: the two teams of the game that feeds it, when both are known. */
function openName(side: TournamentBracketSide, byId: ReadonlyMap<string, TournamentBracketMatchup>): string {
  const feeder = side.from === null ? undefined : byId.get(side.from);
  if (!feeder || feeder.sides.some((s) => s.teamId === null)) return 'TBD';
  return `${teamName(feeder.sides[0])} or ${teamName(feeder.sides[1])}`;
}

/**
 * A matchup with the snapshot's own result where the page has none yet: the winner and each side's figure from the
 * joined final. A side is matched on its MaxPreps id; a game whose sides do not match the matchup's changes nothing.
 */
function resolve(m: TournamentBracketMatchup, game: Game | undefined): TournamentBracketMatchup {
  if (m.winner !== null || !game) return m;
  const won = winningSide(game);
  if (won === null) return m;
  const sideOf = (s: TournamentBracketSide) =>
    s.teamId === null ? null : s.teamId === game.home.teamId ? ('home' as const) : s.teamId === game.away.teamId ? ('away' as const) : null;
  const [a, b] = [sideOf(m.sides[0]), sideOf(m.sides[1])];
  if (a === null || b === null || a === b) return m;
  return {
    ...m,
    winner: a === won ? 0 : 1,
    sides: [{ ...m.sides[0], score: game[a].score }, { ...m.sides[1], score: game[b].score }],
  };
}

/**
 * The CCS bracket games (`playoffs.games`) that no stored bracket holds: all of them where there are no brackets
 * (field hockey), none once every division was read. The by-round paths draw these, so a game is never lost
 * because its division's page was not read.
 */
export function uncoveredBracketGames(playoffs: Pick<CcsPlayoffs, 'games' | 'brackets'>): Game[] {
  const covered = new Set((playoffs.brackets ?? []).flatMap((b) => b.matchups.map((m) => m.contestId)));
  return playoffs.games.filter((g) => !covered.has(g.contestId));
}

function line(
  m: TournamentBracketMatchup,
  index: 0 | 1,
  decided: boolean,
  byId: ReadonlyMap<string, TournamentBracketMatchup>,
): TournamentTieLine {
  const side = m.sides[index];
  if (side.teamId === null) return { slug: null, name: openName(side, byId), seed: null, result: null, open: true };
  return {
    slug: getTeamById(side.teamId)?.slug ?? null,
    name: teamName(side),
    seed: side.seed,
    ...(decided ? { score: side.score } : {}),
    result: !decided ? null : m.winner === index ? 'won' : 'lost',
    open: false,
  };
}

/** MaxPreps writes a location as '@ Los Gatos HS'; the cell has already said who plays. */
function venueWords(text: string | null | undefined): string | null {
  const words = (text ?? '').replace(/^@\s*/, '').trim();
  // A venue field that only repeats the round ('CCS Quarterfinals') names no place.
  return words.length > 0 && !/\b(quarter|semi)?\s*finals?\b|\bround\b/i.test(words) ? words : null;
}

function tie(
  stored: TournamentBracketMatchup,
  viewId: string,
  byId: ReadonlyMap<string, TournamentBracketMatchup>,
  games: ReadonlyMap<ContestId, Game>,
  today: string,
): TournamentTie {
  const game = stored.contestId === null ? undefined : games.get(stored.contestId);
  const m = resolve(stored, game);
  const decided = m.winner !== null;
  const known = m.sides.every((s) => s.teamId !== null);
  // The game's own start: the snapshot's game when it is one of ours, else what the page prints.
  const dateLocal = game && !game.isDateTba ? game.dateLocal : m.dateLocal;
  const dateKey = dateLocal?.slice(0, 10) ?? m.roundDate;
  const hhmm = dateLocal && !(game?.isTimeTba ?? false) ? dateLocal.slice(11, 16) : null;
  const upcoming = !decided && known && dateKey >= today;
  const lines: [TournamentTieLine, TournamentTieLine] = [line(m, 0, decided, byId), line(m, 1, decided, byId)];
  const site = m.site ?? venueWords(game?.venue.text);

  const a = m.sides[0].teamId === null ? openName(m.sides[0], byId) : teamWords(m.sides[0]);
  const b = m.sides[1].teamId === null ? openName(m.sides[1], byId) : teamWords(m.sides[1]);
  const when = `${shortDate(dateKey)}${hhmm ? `, ${leagueClockPT(hhmm)}` : ''}`;
  let sentence: string;
  let note: string | null = null;
  if (decided) {
    const w = m.sides[m.winner as 0 | 1];
    const l = m.sides[m.winner === 0 ? 1 : 0];
    const score = w.score !== null && l.score !== null ? ` ${w.score}${EN_DASH}${l.score}` : '';
    sentence = `${teamWords(w)} beat ${teamWords(l)}${score || '; no score was posted'}.`;
    if (dateKey !== m.roundDate) note = `Played ${shortDate(dateKey)}`;
  } else if (!known) {
    sentence = `${a} v ${b}, ${when}${site ? `, at ${site}` : ''}. Not decided yet.`;
    if (site) note = `At ${site}`;
  } else if (upcoming) {
    sentence = `${a} plays ${b}, ${when}${site ? `, at ${site}` : ''}.`;
    if (site) note = `At ${site}`;
  } else {
    sentence = `${a} and ${b} were to play ${shortDate(dateKey)}; no result is posted yet.`;
    note = 'No result posted yet';
  }

  const links: TournamentTie['links'] = [];
  if (upcoming && game?.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (upcoming && game?.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  const clock = hhmm ? leagueClock(hhmm) : 'TBD';
  return {
    key: m.id,
    id: `${viewId}-${m.id.slice(0, 8)}`,
    state: decided ? 'final' : upcoming ? 'upcoming' : null,
    lines,
    // The round's heading carries its day; a game off it says which day.
    time: upcoming ? (dateKey === m.roundDate ? clock : `${shortDate(dateKey).split(' ')[0]} ${clock}`) : null,
    note,
    links,
    href: game ? gameHref(game.contestId) : null,
    contestId: game ? game.contestId : null,
    gameSeeds: game
      ? {
          away: m.sides.find((s) => s.teamId !== null && s.teamId === game.away.teamId)?.seed ?? null,
          home: m.sides.find((s) => s.teamId !== null && s.teamId === game.home.teamId)?.seed ?? null,
        }
      : null,
    sentence,
  };
}

function byesOf(level: readonly TournamentBracketMatchup[]): string | null {
  const teams = level
    .filter((m) => m.bye)
    .flatMap((m) => m.sides.filter((s) => s.teamId !== null))
    .sort((x, y) => (x.seed ?? 99) - (y.seed ?? 99));
  return teams.length > 0 ? teams.map(teamWords).join(', ') : null;
}

function bracketView(
  bracket: TournamentBracket,
  games: ReadonlyMap<ContestId, Game>,
  today: string,
  regionWord: string,
): TournamentBracketView | null {
  const byId = new Map(bracket.matchups.map((m) => [m.id, m]));
  const lastId = bracket.matchups.find((m) => m.next === null)?.id;
  // A side the page has not filled, whose feeding game the snapshot already has as a final: the winner goes through.
  for (const m of bracket.matchups) {
    m.sides.forEach((side, i) => {
      const feeder = side.teamId === null && side.from !== null ? byId.get(side.from) : undefined;
      if (!feeder || feeder.bye) return;
      const done = resolve(feeder, feeder.contestId === null ? undefined : games.get(feeder.contestId));
      if (done.winner === null) return;
      const through = done.sides[done.winner];
      const current = byId.get(m.id) ?? m;
      const sides: [TournamentBracketSide, TournamentBracketSide] = [current.sides[0], current.sides[1]];
      sides[i] = { ...side, teamId: through.teamId, name: through.name, seed: through.seed };
      byId.set(m.id, { ...current, sides });
    });
  }
  const last = lastId === undefined ? undefined : byId.get(lastId);
  if (!last || !holdsOurs(bracket.matchups)) return null;

  // A CIF State bracket: the regional our teams are in, then the state final. Else the whole tree.
  let levels = levelsFrom(last, byId);
  let regional = false;
  if (bracket.event === 'cif') {
    const halves = last.sides.map((s) => (s.from === null ? undefined : byId.get(s.from)));
    const ours = halves.filter((h): h is TournamentBracketMatchup => h !== undefined && holdsOurs(levelsFrom(h, byId).flat()));
    if (halves.every((h) => h !== undefined) && ours.length === 1) {
      levels = [[last], ...levelsFrom(ours[0], byId)];
      regional = true;
    }
  }
  const id = `${bracket.event}-${slugOf(bracket.name)}`;
  const rounds: TournamentRound[] = levels
    .slice()
    .reverse()
    .map((level, index) => {
      const played = level.filter((m) => !m.bye);
      const head = played[0] ?? level[0];
      return {
        key: `${id}-${index}`,
        name: roundName(head.round, played.length),
        dateLabel: shortDate(head.roundDate),
        ties: played.map((m) => tie(m, id, byId, games, today)),
        byes: byesOf(level),
      };
    })
    .filter((round) => round.ties.length > 0);

  const opening = levels[levels.length - 1];
  const drawn = regional ? levels.slice(1).flat() : [...byId.values()];
  const teams = new Set(drawn.flatMap((m) => m.sides.map((s) => s.teamId)).filter((t) => t !== null)).size;
  const count = opening.length > 0 && teams > 0 ? `${teams} teams` : '';
  const names = EVENT_NAME[bracket.event];
  return {
    id,
    event: bracket.event,
    name: `${names.full} ${bracket.name}`,
    nav: `${names.short} ${bracket.name.replace(/\s+Division$/i, '')}`,
    meta: regional ? `${regionWord} regional, ${count}` : count,
    url: bracket.url,
    rounds,
  };
}

/**
 * Every bracket to draw, and the CCS divisions left to the official page. `games` are the snapshot's (a cell
 * whose contest is among them links to its game page); `today` is getToday(), never Date.now(); `regionWord`
 * names the regional our teams play in ('NorCal').
 */
export function tournamentBracketsView(
  brackets: readonly TournamentBracket[] | undefined,
  games: readonly Game[],
  today: string,
  regionWord = 'NorCal',
): TournamentBracketsView {
  const byContest = new Map(games.map((g) => [g.contestId, g]));
  const views = (brackets ?? []).map((b) => ({ bracket: b, view: bracketView(b, byContest, today, regionWord) }));
  const drawn = views.flatMap((v) => (v.view ? [v.view] : []));
  return {
    brackets: [...drawn.filter((v) => v.event === 'cif'), ...drawn.filter((v) => v.event === 'ccs')],
    ccsOthers: views.filter((v) => v.view === null && v.bracket.event === 'ccs').map((v) => v.bracket.name),
  };
}
