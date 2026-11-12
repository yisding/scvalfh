import Link from 'next/link';

import { longDate, timeOfDayPT } from '../../lib/format';
import { gameAddress } from '../../lib/schools/venue';
import { getTeamBySlug } from '../../lib/teams';
import type { Game } from '../../lib/types';

import { NON_MEMBER_NOTE, lostAttr, rowState, wonAttr } from '../game-row/summary';
import GhostMonogram from '../ui/GhostMonogram';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame, statusLabelIsTime, type GameDisplay, type SideView } from '../ui/describe-game';
import { sourceMarkWords } from '../ui/source-mark';

/**
 * The /game/[id] header (DESIGN §33): the status line, then two stacked team rows, away over home,
 * each a 56px logo, the name (a link to the team's page), what the page wants under it (the record
 * and whose table it is from), and the score at the row's end. ONE layout at every width, left-aligned
 * and capped at 34rem by `.sx-scoreboard`; the winner is bold and the losing side grey
 * (`data-won` / `data-lost`), a tie, a live game and a game still to play leave both sides alone.
 *
 * The two team rows are the page's `<h1>`: its accessible name is the game's own sentence
 * (`describeGame`), then the two names as links. The scores, seeds and records beside them are
 * `aria-hidden`, since the sentence already says them.
 *
 * A side outside the registry has no page here and no record: its name is plain text beside the
 * ghost square its rows use, with NON_MEMBER_NOTE under it.
 *
 * `GameFacts` is the list under the board: the date (the link back to that score day) and the start
 * time, where it is played, the words for a score that is not MaxPreps' own (the legend of the `†`
 * the status line carries, SPEC §7.9), and the short Updated stamp when the page passes one.
 */
export interface ScoreBoardSideMeta {
  sub?: string | null;
  /** The side's seed in a seeded bracket: printed as `#7` after the name. */
  seed?: number | null;
}

export interface ScoreBoardProps {
  game: Game;
  home?: ScoreBoardSideMeta;
  away?: ScoreBoardSideMeta;
  className?: string;
}

function BoardSide({
  side,
  which,
  meta,
  decided,
  showScore,
}: {
  side: SideView;
  which: 'away' | 'home';
  meta: ScoreBoardSideMeta | undefined;
  decided: boolean;
  showScore: boolean;
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const sub = meta?.sub ?? (team ? null : NON_MEMBER_NOTE);
  const won = decided ? wonAttr(side) : undefined;
  const lost = decided ? lostAttr(side) : undefined;
  return (
    <>
      <span
        className={showScore ? 'sx-sb-team' : 'sx-sb-team col-span-full'}
        data-side={which}
        data-team-slug={team?.slug}
        data-won={won}
        data-lost={lost}
      >
        {team ? (
          <TeamMonogram team={team} size={56} />
        ) : (
          <GhostMonogram name={side.name} size={56} title={NON_MEMBER_NOTE} />
        )}
        <span className="min-w-0">
          {team ? (
            <Link href={`/teams/${team.slug}`} prefetch={false} className="sx-teamlink">
              {team.name}
            </Link>
          ) : (
            side.name
          )}
          {meta?.seed !== null && meta?.seed !== undefined ? (
            <>
              {' '}
              <span className="sx-seed sx-num" aria-hidden="true">
                #{meta.seed}
              </span>
            </>
          ) : null}
          {sub ? <small aria-hidden={team ? 'true' : undefined}>{sub}</small> : null}
        </span>
      </span>
      {showScore ? (
        <span className="sx-num sx-sb-score" data-side={which} data-won={won} data-lost={lost} aria-hidden="true">
          {side.glyph}
        </span>
      ) : null}
    </>
  );
}

/** The status line's words: `Final, overtime`, `Postponed`; a start time for a game still to play; Live for one in progress. */
function BoardStatus({ game, display }: { game: Game; display: GameDisplay }) {
  if (game.status === 'live') return <span className="sx-live">Live</span>;
  if (statusLabelIsTime(game, display.statusLabel)) {
    return <span className="sx-num">{game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal)}</span>;
  }
  return <StatusLabel display={display} showChips={false} />;
}

export function ScoreBoard({ game, home, away, className }: ScoreBoardProps) {
  const display = describeGame(game);
  const decided = rowState(game, display) === 'final';
  const showScore = display.showScores && display.away.hasScore && display.home.hasScore;
  return (
    <div className={['sx-scoreboard', className].filter(Boolean).join(' ')}>
      <span className="sx-sb-status" aria-hidden="true">
        <BoardStatus game={game} display={display} />
      </span>
      {/* The h1 takes the board's two columns (subgrid), so each score still sits at its row's end. */}
      <h1 className="col-span-full m-0 grid grid-cols-subgrid items-center gap-y-2 font-sans">
        <span className="sr-only">
          {display.sentence}
          {display.sourceMark !== null ? ` ${sourceMarkWords(display.sourceMark)}.` : ''}{' '}
        </span>
        {/* Away before home, the same order as every list on the site. */}
        <BoardSide side={display.away} which="away" meta={away} decided={decided} showScore={showScore} />
        <BoardSide side={display.home} which="home" meta={home} decided={decided} showScore={showScore} />
      </h1>
    </div>
  );
}

export interface GameFactsProps {
  game: Game;
  /** `<LastUpdated variant="time" … />` while the game is live or is today's; omitted on a past final. */
  stamp?: React.ReactNode;
  className?: string;
}

/** The facts under the board, one item each: when (the date links its score day), where, the score's source. */
export function GameFacts({ game, stamp, className }: GameFactsProps) {
  const display = describeGame(game);
  // A game still to play has its start time as the board's status line; it is not said again here.
  const timeAbove = game.status !== 'live' && statusLabelIsTime(game, display.statusLabel);
  // Where: the venue's own name when a source gave one; else the league final's fixed site; else the host's school.
  // The street address and Directions are in Details.
  const at = gameAddress(game);
  const host = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  const where = game.venue.name
    ? game.venue.name
    : at?.source === 'final-site' && at.school
      ? `at ${at.school.name}`
      : game.site === 'neutral'
        ? 'Neutral site'
        : host
          ? // A school named for its city (Salinas, in Salinas) says the place once.
            host.name.includes(host.city)
            ? `at ${host.name}`
            : `at ${host.name}, ${host.city}`
          : `at ${game.home.name}`;
  return (
    <ul className={['sx-metalist', className].filter(Boolean).join(' ')}>
      <li>
        <Link href={`/scores/${game.dateKey}`} prefetch={false} className="sx-link">
          {longDate(game.dateLocal)}
        </Link>
        {timeAbove ? '' : game.isTimeTba ? ', time TBA' : `, ${timeOfDayPT(game.dateLocal)}`}
      </li>
      <li>{where}</li>
      {display.note ? <li>{display.note}</li> : null}
      {/* The legend for the status line's † (a footnote mark is never left unexplained). */}
      {display.sourceMark !== null ? <li>&dagger; {sourceMarkWords(display.sourceMark)}</li> : null}
      {stamp ? <li>{stamp}</li> : null}
    </ul>
  );
}

export default ScoreBoard;
