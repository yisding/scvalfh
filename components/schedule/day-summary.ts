/**
 * One day's slate, reduced to the few strings `/scores/[date]`'s `<title>`, description and OG card
 * need, and its grouping (by region, then league). Shared by the page and the image so a link preview
 * can never disagree with the page.
 *
 * Every score here comes from `describeGame()` — the one implementation of DESIGN §5.2 — so a
 * missing score is an en dash in the OG card exactly as it is in the HTML. There is no second
 * code path that could render `0-0` for a game that was never played.
 */

import { matchupJoiner } from '../../lib/format';
import { DEFAULT_REGION, LEAGUES, REGIONS, findDivision, regionOf } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, RegionId } from '../../lib/types';
import { describeGame } from '../ui/describe-game';
import { gameWord, plural } from '../ui/plural';

import { countGames, type ScheduleCounts } from './filter-data';

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
  parts.push(...stateSentences(counts));
  return { ...counts, headline, sentence: parts.join(' ') };
}

/** The sentences after the counts: the scores still missing, or the promise when nothing has started. */
function stateSentences(counts: ScheduleCounts): string[] {
  const out: string[] = [];
  if (counts.pending > 0) {
    out.push(`${counts.pending} ${counts.pending === 1 ? 'game has' : 'games have'} no reported score yet.`);
  }
  if (counts.upcoming > 0 && counts.final === 0 && counts.pending === 0) {
    out.push('Scores appear here once MaxPreps posts them.');
  }
  return out;
}

/**
 * The day page's `<meta name="description">` (and og:description). A day with games in one region only
 * keeps daySummary's sentence word for word, so a NorCal-only day reads as it always has. A day with
 * games in both regions says each region's count and its finals, NorCal first (REGIONS order), as the
 * page's header badges do: "Girls varsity field hockey on Wednesday, September 30, 2026. NorCal: 6
 * games; Los Gatos 4, Saratoga 1 · …. SoCal: 9 games; …." A region's count is every game with a side
 * in it (DayRegion.withSide), so a NorCal vs SoCal game counts in both, as on /schedule's every-day rows;
 * the trailing state sentences count the day's games once each.
 */
export function dayDescription(games: readonly Game[], longDateText: string): string {
  const present = dayRegions(games).regions.filter((r) => r.withSide.length > 0);
  if (present.length < 2) return daySummary(games, longDateText).sentence;
  const parts = [`Girls varsity field hockey on ${longDateText}.`];
  for (const region of present) {
    const { headline } = daySummary(region.withSide, longDateText);
    parts.push(`${region.shortName}: ${plural(region.withSide.length, 'game')}${headline ? `; ${headline}` : ''}.`);
  }
  parts.push(...stateSentences(countGames(games)));
  return parts.join(' ');
}

// ---------------------------------------------------------------- league groups (/scores/[date])

/** The league a game belongs to on a day page: its counted division's league, else its postseason league. */
function gameLeague(game: Pick<Game, 'countsFor' | 'postseason'>): LeagueId | null {
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
 * postseason it is), otherwise under Non-league. The day page calls it once per region
 * (dayRegions), over that region's games.
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

// ---------------------------------------------------------------- region blocks (/scores/[date])

/** The regions of a game's registry sides: none, one, or both for a NorCal vs SoCal game. */
function sideRegions(game: Pick<Game, 'home' | 'away'>): Set<RegionId> {
  const out = new Set<RegionId>();
  for (const side of [game.away, game.home]) {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    if (team) out.add(regionOf(team.league));
  }
  return out;
}

/** Where a game sits on a day page: one region's block, or the NorCal vs SoCal block between them. */
export type DayPlace = RegionId | 'between-regions';

/**
 * A game's place on a day page (DESIGN §24.3). A league game, or a league's postseason game, sits in
 * its league's region, beside the rest of that league's games. Any other game sits in the region of
 * its registry sides: both NorCal, or one NorCal team and a team outside the registry,
 * is NorCal's 'Non-league'. A game with a registry side in each region is 'between-regions', listed
 * once, in its own block, never in either region's. No game in the snapshot has no registry side (the
 * feed is the 99 teams' schedules); one would fall to the default region rather than vanish.
 */
export function dayPlace(game: Game): DayPlace {
  const league = gameLeague(game);
  if (league !== null) return regionOf(league);
  const regions = [...sideRegions(game)];
  if (regions.length > 1) return 'between-regions';
  return regions[0] ?? DEFAULT_REGION;
}

/** One region's block of a day page. */
export interface DayRegion {
  id: RegionId;
  /** 'Northern California' | 'Southern California': the block's h2. */
  name: string;
  /** 'NorCal' | 'SoCal': the header badges and the description. */
  shortName: string;
  /** '' for NorCal (its ids are the page's ids from before the regions), '-socal' for SoCal (the DESIGN-socal §2.4 id rule). */
  idSuffix: '' | '-socal';
  /** dayGroups over the block's games; a group id the other block can repeat ('non-league') takes idSuffix. */
  groups: DayGroup[];
  /** The block's own games (every group's), in the day's order. */
  games: Game[];
  /** Every game with a side in the region: the block's games plus the NorCal vs SoCal games, in the day's order. */
  withSide: Game[];
}

export interface DayRegions {
  /** Both regions, REGIONS order (NorCal first), each present even on a day it has no game. */
  regions: DayRegion[];
  /** The NorCal vs SoCal games, in the day's order. */
  between: Game[];
}

/**
 * A day's games by region, then by league (dayGroups within each region). Every game is in exactly one
 * place: one region's groups, or `between`.
 */
export function dayRegions(games: readonly Game[]): DayRegions {
  const place = new Map(games.map((g) => [g.contestId, dayPlace(g)]));
  const between = games.filter((g) => place.get(g.contestId) === 'between-regions');
  const regions = REGIONS.map((region): DayRegion => {
    const mine = games.filter((g) => place.get(g.contestId) === region.id);
    const idSuffix = region.id === 'norcal' ? ('' as const) : ('-socal' as const);
    return {
      id: region.id,
      name: region.name,
      shortName: region.shortName,
      idSuffix,
      groups: dayGroups(mine).map((group) => (group.leagueId === null ? { ...group, id: `${group.id}${idSuffix}` } : group)),
      games: mine,
      withSide: games.filter((g) => {
        const at = place.get(g.contestId);
        return at === region.id || at === 'between-regions';
      }),
    };
  });
  return { regions, between };
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
