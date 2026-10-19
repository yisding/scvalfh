import { shortDate } from '@/lib/format/dates';
import type { MovedGame } from '@/views/scores/scores-view';

/**
 * `game.official.scheduledDate` is the date on the league's official schedule. When it differs from
 * the date the game is actually on, the game moved — worth one sentence, because a parent looking at
 * the printed schedule will otherwise think we have the wrong day. One sentence per block, over that
 * block's games, so a region's note never names the other region's games.
 */
export default function MovedNote({ moved }: { moved: readonly MovedGame[] }) {
  if (moved.length === 0) return null;
  return (
    <p className="sx-inset mt-stack mb-0 max-w-prose">
      {moved.length === 1 ? 'One game here was moved' : `${moved.length} games here were moved`}{' '}
      from the date on the league&rsquo;s official schedule:{' '}
      {moved
        .map((game) => `${game.awayName} at ${game.homeName}, originally ${shortDate(game.scheduledDate)}`)
        .join('; ')}
      .
    </p>
  );
}
