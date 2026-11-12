import Link from 'next/link';

import { gameHref } from '../../lib/game-id';
import { GameLogRowBody, gameLogRowClass } from '../game-row/GameLogRow';
import SectionHeader from '../ui/SectionHeader';

import type { GameModel } from './game-view';

/**
 * SEASON SERIES (DESIGN §33) — every contest between the same two schools, in date order, with the
 * game being viewed marked ("this game") rather than linked to itself. Nothing renders when this game
 * is the only meeting: the header already says it.
 *
 * Each meeting is the team page's game-log row (`GameLogRowBody` + `gameLogRowClass`), not a
 * look-alike, so the two lists share their fixed date / chip / score columns. Only the wrapper is
 * this component's: a link per meeting, and the meeting on this page as a non-link
 * `aria-current="page"` row. Whose side the chips and "vs / at" are told from is the heading's fact.
 *
 * Every score goes through `describeGame` inside that row, so an unreported meeting renders a dash
 * and never `0-0` (DESIGN §5.2, §5.3). Why head-to-head matters to a table is on /about.
 */
export interface SeasonSeriesProps {
  model: GameModel;
  className?: string;
}

export function SeasonSeries({ model, className }: SeasonSeriesProps) {
  const { series } = model;
  const perspective = series.perspective.team?.slug ?? null;
  if (series.meetings.length < 2) return null;

  return (
    <section className={className} aria-labelledby="game-series-kicker">
      <SectionHeader
        kicker="Season series"
        as="h2"
        id="game-series-kicker"
        meta={series.perspective.team ? `${series.perspective.team.shortName}’s results` : undefined}
      />
      <ol className="sx-list">
        {series.meetings.map(({ game, isThisGame }) => (
          <li key={game.contestId}>
            {isThisGame ? (
              <span className={gameLogRowClass(game)} aria-current="page">
                <GameLogRowBody game={game} perspective={perspective} isThisGame />
              </span>
            ) : (
              // `prefetch={false}` for the reason the nav and the standings rows carry it
              // (components/layout/NavLink.tsx, components/ui/PinNote.tsx): every route
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
      <p className="sx-note">{series.summary}</p>
    </section>
  );
}

export default SeasonSeries;
