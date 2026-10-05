import Link from 'next/link';

import { gameHref } from '../../lib/game-id';
import { GameLogRowBody, gameLogRowClass } from '../ui/GameRow';
import SectionHeader from '../ui/SectionHeader';
import { plural } from '../ui/plural';

import type { GameModel } from './game-view';

/**
 * THESE TWO THIS SEASON (DESIGN §3.5) — every contest between the same two schools, in date order,
 * with the game being viewed marked rather than linked to itself.
 *
 * Why it earns its place on a per-game page: every league here plays a double round robin and
 * breaks ties on head-to-head (SCVAL Article VI §3, BVAL §6b, MCAL's head-to-head winning
 * percentage, PCAL §23.3 for its top places), so "these two" is a two-game story the standings may
 * eventually turn on. The note under the list cites the game's own league.
 *
 * Each meeting is the team page's game-log row (`GameLogRowBody` + `gameLogRowClass`), not a
 * look-alike, so the two lists share columns, the short name at 14px, the aligned score grid, the
 * league/postseason chips and the clock face for an upcoming meeting. Only the wrapper is this
 * component's: a link per meeting, and the meeting on this page as a non-link
 * `aria-current="page"` band on surface-2.
 *
 * Every score goes through `describeGame` + `ScoreGlyph` inside that row, so an unreported
 * meeting renders two en dashes and never `0 – 0` (DESIGN §5.2, §5.3).
 */
export interface SeasonSeriesProps {
  model: GameModel;
  className?: string;
}

export function SeasonSeries({ model, className }: SeasonSeriesProps) {
  const { series } = model;
  const perspective = series.perspective.team?.slug ?? null;
  const n = series.meetings.length;
  // Whose side the results, scores and "vs/at" are told from rides in the header meta, where a
  // reader looks before the rows, instead of a footnote under them. One meeting needs no such
  // note: there is nothing to compare it with.
  const meta = `${plural(n, 'meeting')}${
    n > 1 && series.perspective.team ? ` · from ${series.perspective.team.shortName}’s side` : ''
  }`;

  return (
    <section className={className} aria-labelledby="game-series-kicker">
      <SectionHeader
        kicker="These two this season"
        as="h2"
        id="game-series-kicker"
        meta={meta}
      />
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {series.meetings.map(({ game, isThisGame }) => (
            <li key={game.contestId}>
              {isThisGame ? (
                <span className={`${gameLogRowClass(game)} bg-surface-2`} aria-current="page">
                  <GameLogRowBody game={game} perspective={perspective} isThisGame />
                </span>
              ) : (
                // `prefetch={false}` for the reason the nav and the standings rows carry it
                // (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                // here is STATIC, so Next 16's `auto` downloads the whole linked route the moment
                // the link scrolls into view, and the series is one game page per meeting.
                // Navigation still fetches on click.
                <Link
                  href={gameHref(game.contestId)}
                  prefetch={false}
                  className={`sx-tap no-underline ${gameLogRowClass(game)}`}
                >
                  <GameLogRowBody game={game} perspective={perspective} />
                </Link>
              )}
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-1 border-t border-divider px-4 py-3 text-meta text-ink-3">
          <p className="m-0 text-ink-2">{series.summary}</p>
          {series.tiebreakNote ? <p className="m-0">{series.tiebreakNote}</p> : null}
        </div>
      </div>
    </section>
  );
}

export default SeasonSeries;
