import type { Game } from '../../lib/types';

import DateHeader from './DateHeader';
import GameList from './GameList';

/**
 * The whole season, date-grouped, server-rendered (DESIGN §3.3).
 *
 * All 158 contests are in the HTML: no pagination, no virtualization, Ctrl-F finds any team on any
 * day. Each date group carries `.sx-dategroup`, i.e. `content-visibility: auto` with
 * `contain-intrinsic-size: auto 480px`, so the browser skips layout and paint for the groups that
 * are off screen while the text stays findable and the anchors stay linkable.
 *
 * `scroll-margin-top` on every group equals the sticky stack, so a `#2026-09-24` anchor from the
 * timeline rail (or from a pasted link) lands with the date header visible instead of underneath
 * the sticky chrome.
 */
export interface ScheduleListProps {
  groups: readonly { date: string; games: Game[] }[];
  /** Renders the `share →` action on each date header. */
  shareLinks?: boolean;
  className?: string;
  id?: string;
}

export function ScheduleList({
  groups,
  shareLinks = true,
  className,
  id,
}: ScheduleListProps) {
  return (
    <div id={id} className={className}>
      {groups.map((group) => (
        <section
          key={group.date}
          id={group.date}
          data-dategroup={group.date}
          className="sx-dategroup mt-6 first:mt-3"
          style={{ scrollMarginTop: 'var(--sx-sticky-stack, 0px)' }}
        >
          <DateHeader
            date={group.date}
            count={group.games.length}
            shareHref={shareLinks ? `/scores/${group.date}` : undefined}
            sticky
          />
          <GameList games={group.games} />
        </section>
      ))}
    </div>
  );
}

export default ScheduleList;
