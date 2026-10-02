import type { Game, LeagueId } from '../../lib/types';

import DateHeader from './DateHeader';
import GameList from './GameList';

/**
 * The whole season, date-grouped, server-rendered (DESIGN §3.3).
 *
 * Every contest of the league is in the HTML: no pagination, no virtualization, Ctrl-F finds any team on any
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
  /** A league-scoped list (`/schedule/<league>`): other leagues' sides carry their league's name. */
  scopeLeague?: LeagueId | null;
  className?: string;
  id?: string;
}

/**
 * Per-group height estimates, kept just ABOVE the measured heights so a skipped group never
 * overflows its placeholder. A flat 16rem per card row was ~100px too tall for an upcoming row and
 * the 49 errors added up to ~3200px at 1280, which sent the rail's smooth "Today" scroll past the
 * target as the groups rendered on the way.
 *
 * Phone row: 76px, up to ~92px for a long status or FINAL + OT + NL. Card row: ~156px upcoming,
 * up to ~220px for a final with a two-line recap, plus the 16px grid gap.
 */
function rowEstimate(games: readonly Game[]): string {
  return games.some((g) => g.status !== 'final' && g.status !== 'scheduled') ? '5.75rem' : '5rem';
}
function cardEstimate(games: readonly Game[]): string {
  return games.some((g) => g.status === 'final' || g.recap) ? '15rem' : '11rem';
}

export function ScheduleList({
  groups,
  shareLinks = true,
  scopeLeague = null,
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
          // an upper estimate of its own height instead — per phone row and per card row by state
          // (2-up from 768px, 3-up from 1024px, 4-up from 1280px, where the 1136px content box
          // always holds four 17rem cards), plus the 48px date header — and `auto` remembers the
          // real size once the group has rendered. Counting the right cards per row keeps the
          // desktop placeholder close to the real page height, so the scrollbar does not lie.
          //
          // Full-bleed on a phone (`max-md:-mx-gutter`): `content-visibility: auto` implies paint
          // containment, so a band that pulled itself out of a gutter-inset group was clipped back
          // to the gutter — no side padding left, and the 2px non-league rule clipped away.
          className="sx-dategroup mt-8 first:mt-6 [contain-intrinsic-size:auto_calc(var(--sx-n)*var(--sx-rh)+3.5rem)] max-md:-mx-gutter md:mt-12 md:first:mt-8 md:[contain-intrinsic-size:auto_calc(var(--sx-r)*var(--sx-ch)+3.5rem)] lg:[contain-intrinsic-size:auto_calc(var(--sx-r3)*var(--sx-ch)+3.5rem)] xl:[contain-intrinsic-size:auto_calc(var(--sx-r4)*var(--sx-ch)+3.5rem)]"
          // No scroll-margin here: html's scroll-padding-top (6.5rem / 7.5rem in globals.css)
          // already clears the top bar plus this 48px date header, and a margin would add to it.
          style={
            {
              '--sx-n': group.games.length,
              '--sx-rh': rowEstimate(group.games),
              '--sx-ch': cardEstimate(group.games),
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
          <GameList games={group.games} variant="grouped" scopeLeague={scopeLeague} />
        </section>
      ))}
    </div>
  );
}

export default ScheduleList;
