/**
 * One day's slate, reduced to the few strings `/scores/[date]`'s `<title>`, description and OG card
 * need. Shared by the page and the image so a link preview can never disagree with the page.
 *
 * Every score here comes from `describeGame()` — the one implementation of DESIGN §5.2 — so a
 * missing score is an en dash in the OG card exactly as it is in the HTML. There is no second
 * code path that could render `0-0` for a game that was never played.
 */

import { matchupJoiner } from '../../lib/format';
import { LEAGUES, findDivision } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId } from '../../lib/types';
import { describeGame } from '../ui/game-view';
import { plural } from '../ui/plural';

import { countGames, gameWord, type ScheduleCounts } from './filter-data';

export interface DayLine {
  contestId: string;
  awayName: string;
  homeName: string;
  /** '7', a genuine '0', or an en dash — never coerced. */
  awayGlyph: string;
  homeGlyph: string;
  awayWinner: boolean;
  homeWinner: boolean;
  /** FINAL · SCORE NOT REPORTED · LIVE · 4:00 PM · TIME TBA */
  statusLabel: string;
  showScores: boolean;
  isNonLeague: boolean;
  /** 'at' normally, 'vs' for the one neutral-site game, where home/away is only an ordering. */
  versus: 'at' | 'vs';
}

function displayName(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.shortName : fallback;
}

export function dayLines(games: readonly Game[]): DayLine[] {
  return games.map((game) => {
    const display = describeGame(game);
    return {
      contestId: game.contestId,
      awayName: displayName(game.away.slug, game.away.name),
      homeName: displayName(game.home.slug, game.home.name),
      awayGlyph: display.away.glyph,
      homeGlyph: display.home.glyph,
      awayWinner: display.away.weight === 'winner',
      homeWinner: display.home.weight === 'winner',
      statusLabel: display.statusLabel,
      showScores: display.showScores,
      isNonLeague: display.isNonLeague,
      versus: matchupJoiner(game),
    };
  });
}

/** Finals first, then everything else — what a link preview should lead with. */
export function orderedForPreview(games: readonly Game[]): Game[] {
  return [...games].sort((a, b) => {
    const rank = (g: Game) => (g.status === 'final' ? 0 : 1);
    return rank(a) - rank(b) || a.dateLocal.localeCompare(b.dateLocal);
  });
}

export interface DaySummary extends ScheduleCounts {
  /** 'Saint Francis 7 Homestead 0 · Los Gatos 4 Saratoga 1' — at most three, finals only. */
  headline: string;
  /** One honest sentence for a `<meta name="description">`. */
  sentence: string;
}

export function daySummary(games: readonly Game[], longDateText: string): DaySummary {
  const counts = countGames(games);
  const finals = orderedForPreview(games).filter((game) => game.status === 'final');
  const headline = dayLines(finals.slice(0, 3))
    .map((line) => `${line.awayName} ${line.awayGlyph}, ${line.homeName} ${line.homeGlyph}`)
    .join(' · ');

  const parts: string[] = [
    `${counts.total} girls varsity field hockey ${gameWord(counts.total)} on ${longDateText}.`,
  ];
  if (headline) parts.push(`${headline}.`);
  if (counts.pending > 0) {
    parts.push(
      `${counts.pending} ${counts.pending === 1 ? 'game has' : 'games have'} no reported score yet.`,
    );
  }
  if (counts.upcoming > 0 && counts.final === 0 && counts.pending === 0) {
    parts.push('Scores appear here once MaxPreps posts them.');
  }
  return { ...counts, headline, sentence: parts.join(' ') };
}

// ---------------------------------------------------------------- league groups (/scores/[date])

/** The league a game belongs to on a day page: its counted division's league, else its postseason league. */
export function gameLeague(game: Pick<Game, 'countsFor' | 'postseason'>): LeagueId | null {
  if (game.countsFor !== null) return findDivision(game.countsFor)?.leagueId ?? null;
  return game.postseason?.leagueId ?? null;
}

export interface DayGroup {
  /** A league id, or 'non-league'. */
  id: string;
  /** `SCVAL · 1 league game` / `SCVAL · 5 league games` / `Non-league · 3` */
  kicker: string;
  leagueId: LeagueId | null;
  games: Game[];
}

/**
 * One day's games grouped by league (SPEC §10.4), config order, then `Non-league · <n>` for the
 * rest. A game appears exactly once: in the league whose table it counts for (or whose
 * postseason it is), otherwise under Non-league.
 */
export function dayGroups(games: readonly Game[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const league of LEAGUES) {
    const mine = games.filter((g) => gameLeague(g) === league.id);
    if (mine.length === 0) continue;
    groups.push({
      id: league.id,
      leagueId: league.id,
      kicker: `${league.shortName} · ${plural(mine.length, 'league game')}`,
      games: mine,
    });
  }
  const rest = games.filter((g) => gameLeague(g) === null);
  if (rest.length > 0) {
    groups.push({ id: 'non-league', leagueId: null, kicker: `Non-league · ${rest.length}`, games: rest });
  }
  return groups;
}

/** The leagues with at least one side in these games, config order. */
export function leaguesInvolved(games: readonly Game[]): LeagueId[] {
  const ids = new Set<string>();
  for (const game of games) {
    for (const side of [game.home, game.away]) {
      const team = side.slug ? getTeamBySlug(side.slug) : undefined;
      if (team) ids.add(team.league);
    }
  }
  return LEAGUES.filter((l) => ids.has(l.id)).map((l) => l.id);
}

/** `Thu Sep 24 · 23 games in 4 leagues` — the per-date OG card's title line (SPEC §8.4). */
export function dayCardTitle(shortDateText: string, games: readonly Game[]): string {
  const k = leaguesInvolved(games).length;
  return `${shortDateText} · ${plural(games.length, 'game')} in ${plural(k, 'league')}`;
}

/** The day's headline result: the final with the largest margin (ties: the earliest). */
export function headlineGame(games: readonly Game[]): Game | null {
  let best: Game | null = null;
  let bestMargin = -1;
  for (const game of orderedForPreview(games)) {
    if (game.status !== 'final' || game.home.score === null || game.away.score === null) continue;
    const margin = Math.abs(game.home.score - game.away.score);
    if (margin > bestMargin) {
      best = game;
      bestMargin = margin;
    }
  }
  return best;
}
