import Link from 'next/link';

import { SummaryLead, SummaryTeams } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { describeGame } from '../ui/describe-game';
import { shortDate } from '../../lib/format';
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
 * Each game is ONE link row (`ResultRow`): the clock, status label (and the † of a si.com score)
 * and the game's league / postseason chips in the lead column, then both sides — result chip, short
 * name, score. It is the `GameRow` face, built from GameRow's own `SummaryLead` and `SummaryTeams`
 * so the same game is the same 76px row on / and on /scores — without the mascot tiles, without
 * its `<details>` body (venue, links, recap) and
 * without a second `GameCard` grid for ≥768px: the home page carries all five leagues' panels in
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
  /** The panel's league: a side from another league carries its short name (`Saint Francis · SCVAL`). */
  scopeLeague?: LeagueId | null;
  className?: string;
}

/** Rows shown: the block says what just happened, and the action goes to the whole day. */
const ROWS = 3;

export function LatestScores({
  date,
  games,
  total,
  kicker = 'Latest scores',
  note,
  scopeLeague = null,
  className,
}: LatestScoresProps) {
  const shown = games.slice(0, ROWS);
  return (
    <section className={className}>
      <SectionHeader
        as="h3"
        kicker={kicker}
        meta={shortDate(date)}
        action={{ href: `/scores/${date}`, label: `All ${total} on ${shortDate(date)}` }}
        // Capped like the card below (DESIGN §26.5 "Measures"), so the action sits over the list.
        className="md:max-w-3xl"
      />
      {note ? <p className="sx-inset mt-0 mb-3 max-w-prose">{note}</p> : null}

      <div className="sx-card sx-flush sx-bleed md:max-w-3xl">
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

/**
 * One game as one link: `[time / status / chips] [chip name score] [chip name score]`, away first.
 * The screen-reader sentence (`describeGame().sentence`) is the link's text; the visual lines are
 * aria-hidden. A missing score is the en dash with "score not reported" (ScoreGlyph), never 0.
 *
 * GameRow's summary grid — the 80px lead, `min-h-gamerow`, the same `py-3` and 8px gap — less its
 * chevron column, with GameRow's own lead and team lines: the score in its 24px box, names that
 * wrap to a second line rather than truncate, `Saint Francis · SCVAL` in another league's panel.
 * Its own lead had stacked the clock over a wrapping status-and-chips line (84 or 98px rows) and
 * its 22px scores set 28px team lines, so one game was 84px here and 76px on /scores, and Home's
 * two-up "Latest from every league" lists drifted apart row by row.
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
      <SummaryLead game={game} display={display} />
      <SummaryTeams display={display} scopeLeague={scopeLeague} monogram={false} />
    </Link>
  );
}

export default LatestScores;
