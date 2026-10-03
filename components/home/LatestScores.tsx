import Link from 'next/link';

import ResultChip from '../ui/ResultChip';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import { describeGame, type SideView } from '../ui/game-view';
import { getLeagueOfTeam } from '../../lib/data';
import { shortDate, timeOfDay } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Game, LeagueId } from '../../lib/types';

/**
 * A league's latest results day (SPEC §10.1, DESIGN §3.1, §8).
 *
 * The day is ALWAYS named, in the meta and in the action (`All 5 on Thu Oct 1`), so a day-old
 * score can never read as "last night" — that is §8's rule for the fallback to the most recent day
 * that actually has results. Each league panel names its own day: the leagues do not play on the
 * same days.
 *
 * Each game is ONE link row (`ResultRow`): the clock and status label (with the game's league /
 * postseason chips and the † of a si.com score) in the lead column, then both sides — result chip,
 * short name, score. It is the `GameRow` face without its `<details>` body (venue, links, recap) and
 * without a second `GameCard` grid for ≥768px: the home page carries all four leagues' panels in
 * its static HTML, and those two renderings of every game were the heaviest markup on the page
 * against the `/` budget (SPEC §12.4: HTML and RSC gzip ≤ 2 × the Stage-0 baseline). The details
 * are one tap away on the game page, which the whole row links to.
 *
 * Three rows at most: the block's job is "what just happened", and the action goes to the whole
 * day on /scores/[date].
 *
 * A game with no reported score renders two en dashes and the words SCORE NOT REPORTED — never
 * `0-0` — because every score on the site goes through `renderScore()` (DESIGN §5.2, §5.3).
 */
export interface LatestScoresProps {
  /** 'YYYY-MM-DD' */
  date: string;
  games: Game[];
  /** How many contests that day, before the cap below. */
  total: number;
  /** "Latest scores", or "Played, not reported" for a day with no results. */
  kicker?: string;
  /** The §8 sentence for a day that was played and reported nothing. */
  note?: string;
  /** Rows to show (default 3). */
  limit?: number;
  as?: 'h2' | 'h3';
  /** The panel's league: a side from another league carries its short name (`Saint Francis · SCVAL`). */
  scopeLeague?: LeagueId | null;
  className?: string;
}

export function LatestScores({
  date,
  games,
  total,
  kicker = 'Latest scores',
  note,
  limit = 3,
  as = 'h3',
  scopeLeague = null,
  className,
}: LatestScoresProps) {
  const shown = games.slice(0, limit);
  return (
    <section className={className}>
      <SectionHeader
        as={as}
        kicker={kicker}
        meta={shortDate(date)}
        action={{ href: `/scores/${date}`, label: `All ${total} on ${shortDate(date)}` }}
      />
      {note ? <p className="sx-inset mt-0 mb-3 max-w-prose">{note}</p> : null}

      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {shown.map((game) => (
            <li key={game.contestId}>
              <ResultRow game={game} scopeLeague={scopeLeague} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** `Saint Francis · SCVAL` inside another league's panel; '' for a side of the panel's league. */
function leagueSuffix(side: SideView, scopeLeague: LeagueId | null): string {
  if (!scopeLeague || !side.slug) return '';
  const league = getLeagueOfTeam(side.slug);
  return league && league.id !== scopeLeague ? ` · ${league.shortName}` : '';
}

function SideLine({ side, showScore, suffix }: { side: SideView; showScore: boolean; suffix: string }) {
  return (
    <span className="flex min-h-6 items-center gap-2">
      <ResultChip kind={side.chip} size={20} />
      {/* The game rows' three-way name weight: a level side (a tie, an unreported score) stays in
          full ink, because neither side lost; a cancelled or postponed side recedes. */}
      <span className={`min-w-0 flex-1 truncate text-body ${nameClass(side)}`}>
        {side.shortName}
        {suffix ? <span className="text-ink-3">{suffix}</span> : null}
      </span>
      {showScore ? <ScoreGlyph side={side} size="score" /> : null}
    </span>
  );
}

/**
 * One game as one link: `[time / status + chips] [chip name score] [chip name score]`, away first.
 * The screen-reader sentence (`describeGame().sentence`) is the link's text; the visual lines are
 * aria-hidden. A missing score is the en dash with "score not reported" (ScoreGlyph), never 0.
 */
export function ResultRow({ game, scopeLeague = null }: { game: Game; scopeLeague?: LeagueId | null }) {
  const display = describeGame(game);
  return (
    <Link
      href={gameHref(game.contestId)}
      prefetch={false}
      className="sx-tap grid min-h-gamerow grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-2 px-gutter py-3 no-underline focus-visible:-outline-offset-2"
    >
      <span className="sr-only">{display.sentence}</span>
      <span className="flex min-w-0 flex-col gap-1 self-start" aria-hidden="true">
        <span className={`sx-num text-cell text-ink-2${display.strikeTime ? ' line-through' : ''}`}>
          {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
        </span>
        <StatusLabel display={display} className="[&>span:first-child]:leading-[0.875rem]" />
      </span>
      <span className="min-w-0 space-y-1" aria-hidden="true">
        <SideLine side={display.away} showScore={display.showScores} suffix={leagueSuffix(display.away, scopeLeague)} />
        <SideLine side={display.home} showScore={display.showScores} suffix={leagueSuffix(display.home, scopeLeague)} />
      </span>
    </Link>
  );
}

export default LatestScores;
