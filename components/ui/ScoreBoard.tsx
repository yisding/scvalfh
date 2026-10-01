import { shortDate, timeOfDayPT } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, TeamSlug } from '../../lib/types';

import { ScoreGlyph } from './ScoreCell';
import StatusLabel from './StatusLabel';
import TeamMonogram from './TeamMonogram';
import { describeGame, type SideView } from './game-view';

/**
 * The /game/[id] hero (DESIGN §3.5, §7.4). A final score is the most-shared object on this site,
 * so this is the shareable scoreboard: a kicker line, then both sides at 32px mono with the
 * winner at 600 weight and the loser at 400, separated by a hairline that reads as the zero-ish
 * rule of the composition.
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

function BoardSide({
  side,
  sub,
  showScore,
}: {
  side: SideView;
  sub?: string | null;
  showScore: boolean;
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    <div className="flex items-center gap-3 py-2">
      {team ? (
        <TeamMonogram team={team} size={40} />
      ) : (
        <span className="inline-block shrink-0" style={{ width: 40 }} />
      )}
      <div className="min-w-0 flex-1">
        <span
          className={`block truncate text-lead ${
            side.weight === 'winner' ? 'font-semibold text-ink' : 'text-ink-2'
          }`}
        >
          {team ? team.name : side.name}
        </span>
        {sub ? <span className="sx-num block text-meta text-ink-3">{sub}</span> : null}
      </div>
      {showScore ? (
        <span className="shrink-0">
          <ScoreGlyph side={side} size="board" />
        </span>
      ) : null}
    </div>
  );
}

export function ScoreBoard({ game, perspective, home, away, className }: ScoreBoardProps) {
  const display = describeGame(game, perspective);
  return (
    <section className={`bg-surface${className ? ` ${className}` : ''}`} aria-label="Scoreboard">
      <p className="sr-only">{display.sentence}</p>
      <p
        className="m-0 flex flex-wrap items-center gap-2 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3"
        aria-hidden="true"
      >
        <StatusLabel display={display} />
        <span>&middot;</span>
        <span className="normal-case tracking-normal">
          {shortDate(game.dateLocal)}
          {game.isTimeTba ? ', time TBA' : `, ${timeOfDayPT(game.dateLocal)}`}
        </span>
        {game.venue.name ? (
          <>
            <span>&middot;</span>
            <span className="normal-case tracking-normal">{game.venue.name}</span>
          </>
        ) : null}
      </p>
      <div aria-hidden="true">
        {/* Away over home, the same order as every list on the site. */}
        <BoardSide side={display.away} sub={away?.sub} showScore={display.showScores} />
        <div className="h-px w-full" style={{ background: 'var(--sx-border-strong)' }} />
        <BoardSide side={display.home} sub={home?.sub} showScore={display.showScores} />
      </div>
      {display.note ? <p className="mt-2 mb-0 text-meta text-ink-3">{display.note}</p> : null}
    </section>
  );
}

export default ScoreBoard;
