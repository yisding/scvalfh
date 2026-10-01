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
      {/* Same shape as GameRow's TeamLine, and for the same reason: the date, the chip, the
          fixed score column, the "this game" tag and the status label are all `shrink-0`, so the
          OPPONENT NAME — the one thing this row exists to say — was the only thing left to give.
          At 390px it had 22px and at 320px it had none. It keeps a floor now, and the trailing
          cluster wraps to a second line instead. */}
      <span
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5"
        aria-hidden="true"
      >
        <span className="sx-num w-12 shrink-0 text-ink-2">{monthDay(game.dateLocal)}</span>
        <ResultChip
          kind={display.perspectiveOutcome ?? (display.showScores ? 'pending' : 'none')}
          size={16}
        />
        <span className="sx-num w-12 shrink-0 text-right">
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
        <span className="min-w-[5.5rem] flex-1 truncate text-ink">
          {display.versus ?? 'vs'} {theirs.name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {isThisGame ? <Tag label="the game on this page">this game</Tag> : null}
          <StatusLabel display={display} />
        </span>
      </span>
    </>
  );

  return (
    <li>
      {isThisGame ? (
        <span
          className="flex min-h-11 items-center px-gutter py-2 text-meta"
          style={{ background: 'var(--sx-surface-2)' }}
          aria-current="page"
        >
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
          className={`sx-tap flex min-h-11 items-center px-gutter py-2 text-meta no-underline${
            display.isNonLeague ? ' sx-nonleague' : ''
          }`}
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
            ? 'one meeting'
            : `${series.meetings.length} meetings`
        }
      />
      <ol className="sx-list sx-bleed mt-2">
        {series.meetings.map((meeting) => (
          <MeetingRow
            key={meeting.game.contestId}
            game={meeting.game}
            perspective={perspective}
            isThisGame={meeting.isThisGame}
          />
        ))}
      </ol>
      <p className="mt-2 mb-0 text-meta text-ink-2">{series.summary}</p>
      {series.meetings.length > 1 && series.perspective.team ? (
        <p className="mt-1 mb-0 text-meta text-ink-3">
          Results, scores and home/away are shown from {series.perspective.name}&rsquo;s side.
        </p>
      ) : null}
      {series.tiebreakNote ? (
        <p className="mt-1 mb-0 text-meta text-ink-3">{series.tiebreakNote}</p>
      ) : null}
    </section>
  );
}

export default SeasonSeries;
