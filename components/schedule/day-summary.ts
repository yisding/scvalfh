/**
 * One day's slate, reduced to the few strings `/scores/[date]`'s `<title>`, description and OG card
 * need. Shared by the page and the image so a link preview can never disagree with the page.
 *
 * Every score here comes from `describeGame()` — the one implementation of DESIGN §5.2 — so a
 * missing score is an en dash in the OG card exactly as it is in the HTML. There is no second
 * code path that could render `0-0` for a game that was never played.
 */

import { getTeamBySlug } from '../../lib/teams';
import type { Game } from '../../lib/types';
import { describeGame } from '../ui/game-view';

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
      versus: game.site === 'neutral' ? 'vs' : 'at',
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
    `${counts.total} SCVAL girls varsity field hockey ${gameWord(counts.total)} on ${longDateText}.`,
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
