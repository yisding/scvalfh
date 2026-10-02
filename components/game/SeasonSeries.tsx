import Link from 'next/link';

import { monthDay } from '../../lib/format';
import ResultChip from '../ui/ResultChip';
import { ScoreGlyph } from '../ui/ScoreCell';
import SectionHeader from '../ui/SectionHeader';
import StatusLabel from '../ui/StatusLabel';
import Tag from '../ui/Tag';
import { describeGame } from '../ui/game-view';
import type { Game, TeamSlug } from '../../lib/types';

import type { GameModel } from './game-model';

/**
 * THESE TWO THIS SEASON (DESIGN §3.5) — every contest between the same two schools, in date order,
 * with the game being viewed marked rather than linked to itself.
 *
 * Why it earns its place on a per-game page: By-Laws Article VI §3 makes head-to-head record the
 * FIRST tiebreak once two division teams finish level on points, and Article VI §1 schedules a
 * double round robin, so "these two" is a two-game story the standings will eventually turn on.
 *
 * Every score goes through `describeGame` + `ScoreGlyph`, so an unreported meeting renders two en
 * dashes and never `0 – 0` (DESIGN §5.2, §5.3).
 */
export interface SeasonSeriesProps {
  model: GameModel;
  className?: string;
}

function MeetingRow({
  game,
  perspective,
  isThisGame,
}: {
  game: Game;
  perspective: TeamSlug | null;
  isThisGame: boolean;
}) {
  const display = describeGame(game, perspective);
  const mineIsHome = perspective ? game.home.slug === perspective : true;
  const mine = mineIsHome ? display.home : display.away;
  const theirs = mineIsHome ? display.away : display.home;

  const body = (
    <>
      <span className="sr-only">
        {isThisGame ? 'This game. ' : ''}
        {display.sentence}
      </span>
      {/* The same four columns as a team page's game log (date · chip · score · the rest), so the
          dates, chips and scores line up. The last column wraps the "this game" tag and the
          status under the opponent rather than truncating the opponent, the one thing this row
          exists to say. */}
      <span className="sx-num text-cell text-ink-2" aria-hidden="true">
        {monthDay(game.dateLocal)}
      </span>
      <span className="inline-flex" aria-hidden="true">
        <ResultChip
          kind={display.perspectiveOutcome ?? (display.showScores ? 'pending' : 'none')}
          size={20}
        />
      </span>
      <span className="sx-num whitespace-nowrap text-right" aria-hidden="true">
        {display.showScores ? (
          <>
            <ScoreGlyph side={mine} size="meta" />
            <span className="text-ink-3">{'–'}</span>
            <ScoreGlyph side={theirs} size="meta" />
          </>
        ) : (
          <span className="text-ink-3">{'–'}</span>
        )}
      </span>
      <span
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"
        aria-hidden="true"
      >
        <span className="line-clamp-2 min-w-[6.5rem] flex-1 text-body text-ink">
          {display.versus ?? 'vs'} {theirs.name}
        </span>
        <span className="flex max-w-full flex-wrap items-center gap-2">
          {isThisGame ? <Tag label="the game on this page">this game</Tag> : null}
          <StatusLabel display={display} />
        </span>
      </span>
    </>
  );

  const ROW =
    'relative grid min-h-row-1 grid-cols-[3.5rem_1.25rem_3.25rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-3 text-meta';

  return (
    <li>
      {isThisGame ? (
        <span className={`${ROW} bg-surface-2`} aria-current="page">
          {body}
        </span>
      ) : (
        // `prefetch={false}` for the reason the nav and the standings rows carry it
        // (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
        // STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
        // into view, and the series is one game page per meeting. Navigation still fetches on click.
        <Link
          href={`/game/${game.contestId}`}
          prefetch={false}
          className={`sx-tap ${ROW} no-underline${display.isNonLeague ? ' sx-nonleague' : ''}`}
        >
          {body}
        </Link>
      )}
    </li>
  );
}

export function SeasonSeries({ model, className }: SeasonSeriesProps) {
  const { series } = model;
  const perspective = series.perspective.team?.slug ?? null;

  return (
    <section className={className} aria-labelledby="game-series-kicker">
      <SectionHeader
        kicker="These two this season"
        as="h2"
        id="game-series-kicker"
        meta={
          series.meetings.length === 1
            ? 'One meeting'
            : `${series.meetings.length} meetings`
        }
      />
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {series.meetings.map((meeting) => (
            <MeetingRow
              key={meeting.game.contestId}
              game={meeting.game}
              perspective={perspective}
              isThisGame={meeting.isThisGame}
            />
          ))}
        </ol>
        <div className="space-y-1 border-t border-divider px-4 py-3 text-meta text-ink-3">
          <p className="m-0 text-ink-2">{series.summary}</p>
          {series.meetings.length > 1 && series.perspective.team ? (
            <p className="m-0">
              Results, scores and home/away are shown from {series.perspective.name}&rsquo;s side.
            </p>
          ) : null}
          {series.tiebreakNote ? <p className="m-0">{series.tiebreakNote}</p> : null}
        </div>
      </div>
    </section>
  );
}

export default SeasonSeries;
