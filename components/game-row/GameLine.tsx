import Link from 'next/link';

import StatusLabel, { GameChips } from '@/components/ui/StatusLabel';
import { getTeamBySlug } from '@/lib/registry/teams';
import { gameHref } from '@/lib/shared/game-id';
import { describeGame } from '@/views/shared/describe-game';

import { GameClock } from './parts/GameClockOrStatus';
import type { GameViewProps } from './props';

/**
 * The compact "Next up" form: `5:30 PM  Homestead at Los Altos`. Normally one line; a matchup
 * that does not fit ("Scripps Ranch at Saint Francis" at 320) wraps WHOLE onto a second line,
 * clamped at two, rather than losing its home team to an ellipsis. The time and the trailing
 * tag stay centred on the pair (`items-center`).
 *
 * The trailing tag track is a FIXED 4rem, end-aligned, sized for the widest league code (SUNSET,
 * 59.5px). It was `auto`, so its width was the tag's own — NL 27.8px, SCVAL 51.6px — and the
 * matchup's width with it: "Valley Christian at Homestead" kept one line beside an NL row's tag
 * and wrapped beside a SCVAL row's. A postseason chip is a phrase no fixed track holds (`SCVAL
 * crossover` is 131px), so it goes on its own line under the matchup instead (GameChips `part`).
 * The final branch (FINAL and the code, wrapping inside the track) is not reached from NextSlate,
 * whose slate holds only games still to play.
 *
 * The time is NOT aria-hidden: it is the link's only statement of when, so the name reads
 * "5:30 PM Homestead at Los Altos SCVAL league game" (the chips' Tag labels carry the words).
 */
export function GameLine({ game, perspective, showChips = true, className }: GameViewProps) {
  const display = describeGame(game, perspective);
  const awayTeam = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  const homeTeam = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  return (
    <Link
      href={gameHref(game.contestId)}
      prefetch={false}
      className={[
        'sx-tap relative grid min-h-row-1 grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-x-3 px-gutter py-2 text-body no-underline',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <GameClock game={game} tba="TBA" className="sx-num text-cell text-ink-2" />
      <span className="min-w-0">
        <span className="line-clamp-2 break-words text-ink">
          {awayTeam ? awayTeam.shortName : game.away.name}
          {game.site === 'neutral' ? ' vs ' : ' at '}
          {homeTeam ? homeTeam.shortName : game.home.name}
        </span>
        {showChips ? <GameChips display={display} part="phrase" className="mt-1" /> : null}
      </span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {display.kind === 'final' ? <StatusLabel display={display} showChips={false} /> : null}
        {showChips ? <GameChips display={display} part="codes" /> : null}
      </span>
    </Link>
  );
}

export default GameLine;
