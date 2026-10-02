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
 * html's `scroll-padding-top` (globals.css) clears the top bar plus a 48px date header, so a
 * `#2026-09-24` anchor from the timeline rail (or from a pasted link) lands with the date header
 * visible instead of underneath the sticky chrome.
 */
export interface ScheduleListProps {
  groups: readonly { date: string; games: Game[] }[];
  /** Renders the Share action on each date header. */
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
          // The global `.sx-dategroup` placeholder is a flat 480px. A group taller than that
          // overflows its skipped box while it is off screen, so its rows overlap the next
          // group's in the page geometry (axe reads that as obscured targets). Each group states
          // an upper estimate of its own height instead — 90px per phone row, 16rem per card row
          // (2-up from 768px, 3-up from 1024px, 4-up from 1280px, where the 1136px content box
          // always holds four 17rem cards), plus the 48px date header — and `auto` remembers the
          // real size once the group has rendered. Counting the right cards per row keeps the
          // desktop placeholder close to the real page height, so the scrollbar does not lie.
          className="sx-dategroup mt-8 first:mt-6 [contain-intrinsic-size:auto_calc(var(--sx-n)*5.625rem+3.5rem)] md:mt-12 md:first:mt-8 md:[contain-intrinsic-size:auto_calc(var(--sx-r)*16rem+3.5rem)] lg:[contain-intrinsic-size:auto_calc(var(--sx-r3)*16rem+3.5rem)] xl:[contain-intrinsic-size:auto_calc(var(--sx-r4)*16rem+3.5rem)]"
          // No scroll-margin here: html's scroll-padding-top (6.5rem / 7.5rem in globals.css)
          // already clears the top bar plus this 48px date header, and a margin would add to it.
          style={
            {
              '--sx-n': group.games.length,
              '--sx-r': Math.ceil(group.games.length / 2),
              '--sx-r3': Math.ceil(group.games.length / 3),
              '--sx-r4': Math.ceil(group.games.length / 4),
            } as React.CSSProperties
          }
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
