import { getLatestResultsDate, getToday } from '../../lib/data';
import { dayNumber } from '../../lib/format';
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
 * Where a `#2026-09-24` anchor lands (the timeline rail, the Scores tab, a pasted link): html's
 * `scroll-padding-top` (globals.css) clears the top bar PLUS a 48px date header, because a focused
 * row inside a group must clear the header that sticks above it. The group carries that header
 * itself, so `.sx-dategroup` hands the 48px back with `scroll-margin-top: -3rem` (F-80): the group
 * top — its date header — parks flush under the top bar, at 56px on a phone and 72px from 768px,
 * with no half-shown header above it.
 *
 * A jump only lands where it was aimed if the groups above the target keep their heights while the
 * scroll happens. A hard load gets that from the browser, which re-runs the fragment scroll while
 * the page settles; a client navigation (the Scores tab, `router.push`) scrolls ONCE, and the
 * groups that then render around the target swap their estimates for real heights and shove it off
 * its mark. So the days around the Scores tab's landing date (`landingDate` below) are never
 * skipped at all: `[content-visibility:visible]` lays them out from the first frame, and the one
 * scroll lands where the hard load does. A day page's "Full season" link can aim at any date, so it
 * is a plain `<a>` (a document navigation) and gets the hard load's settling scroll instead.
 *
 * Each date header links to that day's own prerendered page, `/scores/[date]` ("Day page"), so a
 * single day can be opened, bookmarked or sent on.
 */
export interface ScheduleListProps {
  groups: readonly { date: string; games: Game[] }[];
  /** A league-scoped list (`/schedule/<league>`): other leagues' sides carry their league's name. */
  scopeLeague?: LeagueId | null;
  className?: string;
  id?: string;
}

/**
 * The date the Scores tab opens on (BottomTabBar's per-league `/schedule/<league>#<date>`, F-1a),
 * from the same snapshot data: the league's latest day at or before "today" with at least one
 * final, otherwise its next day with a contest. League-aware so the always-laid-out window below
 * surrounds the date the tab actually aims at on this league's list. "Today" is the snapshot's
 * Pacific day, never the clock.
 */
function landingDate(dates: readonly string[], league: LeagueId | null): string | null {
  const today = getToday();
  return (
    getLatestResultsDate(league ? { league } : {}) ??
    dates.find((d) => d >= today) ??
    null
  );
}

/**
 * How many calendar days either side of the landing date are always laid out. A week each way
 * covers what the landing scroll can touch at any width (11 groups, ~40 rows on the Oct 2
 * snapshot); every group outside it keeps its skipped placeholder, so the page still costs little
 * to lay out.
 */
const LANDING_WINDOW_DAYS = 7;

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

export function ScheduleList({ groups, scopeLeague = null, className, id }: ScheduleListProps) {
  const landing = landingDate(groups.map((group) => group.date), scopeLeague);
  const landingDay = landing ? dayNumber(landing) : null;
  return (
    // `max-md:mt-4`: on a phone the groups carry no top margin of their own (below), so the gap
    // between the rail and the first SHOWN group lives here, where it survives a filter hiding
    // the first group — a `first:` margin on the group would not.
    <div id={id} className={['max-md:mt-4', className].filter(Boolean).join(' ')}>
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
          //
          // No gap between days on a phone (`mt-0`): the date header draws a rule above and below
          // itself (DateHeader), and the 32px gaps that used to sit here cost a whole row of the
          // fold. From 768px the cards float on the canvas, and the 48px gap is what groups them.
          //
          // Landing: html's scroll-padding-top clears the top bar plus a 48px header, and
          // `.sx-dategroup`'s `scroll-margin-top: -3rem` (globals.css, F-80) hands those 48px
          // back, because the group's own header is what should sit under the bar.
          className={[
            'sx-dategroup mt-0 [contain-intrinsic-size:auto_calc(var(--sx-n)*var(--sx-rh)+3.5rem)] max-md:-mx-gutter md:mt-12 md:first:mt-8 md:[contain-intrinsic-size:auto_calc(var(--sx-r)*var(--sx-ch)+3.5rem)] lg:[contain-intrinsic-size:auto_calc(var(--sx-r3)*var(--sx-ch)+3.5rem)] xl:[contain-intrinsic-size:auto_calc(var(--sx-r4)*var(--sx-ch)+3.5rem)]',
            // Within a week of the landing date: always laid out (see the docblock), so a client
            // navigation's single scroll lands where a hard load does.
            landingDay !== null &&
            Math.abs(dayNumber(group.date) - landingDay) <= LANDING_WINDOW_DAYS
              ? '[content-visibility:visible]'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
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
            shareHref={`/scores/${group.date}`}
            sticky
          />
          <GameList games={group.games} variant="grouped" scopeLeague={scopeLeague} />
        </section>
      ))}
    </div>
  );
}

export default ScheduleList;
