import { shortDate, timeOfDayPT } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, TeamSlug } from '../../lib/types';

import { ScoreGlyph } from './ScoreCell';
import StatusLabel from './StatusLabel';
import TeamMonogram from './TeamMonogram';
import { describeGame, type SideView } from './game-view';

/**
 * The /game/[id] hero (DESIGN §3.5, §7.4; modernization brief §4.16). A final score is the
 * most-shared object on this site, so this is the shareable scoreboard: a status line, then both
 * sides with the score at display size, the winner at 600 weight and the loser at 400.
 *
 * ONE DOM for every width — away side, separator, home side — so the reading order never changes:
 * - phone: two stacked rows (monogram 40 · name · score) with a divider line between them;
 * - ≥768px: a three-column grid, `away | – | home`, the away side right-aligned and the home side
 *   reversed so both scores sit against the centre dash (monogram 56).
 *
 * Each ScoreGlyph is wrapped in `.sx-board-score`, whose unlayered rule in globals.css sets it at
 * `--text-display`: ScoreGlyph's own class string is frozen (tests/ui/rendered-never-00.test.ts).
 *
 * `sub` is whatever the page wants under each name — normally "4-1-0 De Anza".
 */
export interface ScoreBoardSideMeta {
  sub?: string | null;
}

export interface ScoreBoardProps {
  game: Game;
  perspective?: TeamSlug | null;
  home?: ScoreBoardSideMeta;
  away?: ScoreBoardSideMeta;
  className?: string;
}

function GhostMark({ size }: { size: 40 | 56 }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
}

function BoardSide({
  side,
  sub,
  showScore,
  align,
}: {
  side: SideView;
  sub?: string | null;
  showScore: boolean;
  align: 'away' | 'home';
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    <div
      className={`flex min-w-0 items-center gap-3 py-3 md:gap-4 md:py-0 ${
        align === 'away' ? 'md:justify-end md:text-right' : 'md:flex-row-reverse md:justify-end md:text-left'
      }`}
    >
      {/* Two decorative monograms, one per breakpoint: 40 on a phone row, 56 on the wide board. */}
      <span className="inline-flex shrink-0 md:hidden">
        {team ? <TeamMonogram team={team} size={40} /> : <GhostMark size={40} />}
      </span>
      <span className="hidden shrink-0 md:inline-flex">
        {team ? <TeamMonogram team={team} size={56} /> : <GhostMark size={56} />}
      </span>
      <div className="min-w-0 flex-1 md:flex-initial">
        <span
          className={`block truncate text-lead md:text-title ${
            side.weight === 'winner' ? 'font-semibold text-ink' : 'font-normal text-ink-2'
          }`}
        >
          {team ? team.name : side.name}
        </span>
        {sub ? <span className="sx-num block text-meta text-ink-3">{sub}</span> : null}
      </div>
      {showScore ? (
        <span className="sx-board-score shrink-0">
          <ScoreGlyph side={side} size="board" />
        </span>
      ) : null}
    </div>
  );
}

export function ScoreBoard({ game, perspective, home, away, className }: ScoreBoardProps) {
  const display = describeGame(game, perspective);
  return (
    <section
      className={`sx-card sx-board p-5 md:p-8${className ? ` ${className}` : ''}`}
      aria-label="Scoreboard"
    >
      <p className="sr-only">{display.sentence}</p>
      <p
        className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3 md:justify-center"
        aria-hidden="true"
      >
        <StatusLabel display={display} />
        <span>
          {shortDate(game.dateLocal)}
          {game.isTimeTba ? ', time TBA' : `, ${timeOfDayPT(game.dateLocal)}`}
        </span>
        {game.venue.name ? (
          <>
            <span>&middot;</span>
            <span>{game.venue.name}</span>
          </>
        ) : null}
      </p>
      <div
        className="mt-3 md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-8"
        aria-hidden="true"
      >
        {/* Away before home, the same order as every list on the site. */}
        <BoardSide
          side={display.away}
          sub={away?.sub}
          showScore={display.showScores}
          align="away"
        />
        <div className="h-px bg-divider md:h-auto md:bg-transparent">
          <span className="hidden text-title text-ink-3 md:inline">&ndash;</span>
        </div>
        <BoardSide
          side={display.home}
          sub={home?.sub}
          showScore={display.showScores}
          align="home"
        />
      </div>
      {display.note ? (
        <p className="mt-3 mb-0 text-meta text-ink-3 md:mt-6 md:text-center">{display.note}</p>
      ) : null}
    </section>
  );
}

export default ScoreBoard;
