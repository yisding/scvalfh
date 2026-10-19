import type { Game } from '@/lib/model/game';
import type { LeagueId } from '@/lib/model/ids';
import { dayNumber } from '@/lib/shared/dates';
import { scoresHref } from '@/lib/shared/routes';
import type { RecordsByGame } from '@/views/shared/game-records';

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
 * its mark. So the days around the Scores tab's landing date (lib/queries/games `getScoresLandingDate`)
 * are never skipped at all: `[content-visibility:visible]` lays them out from the first frame, and
 * the one scroll lands where the hard load does. A day page's "Full season" link can aim at any date, so it
 * is a plain `<a>` (a document navigation) and gets the hard load's settling scroll instead.
 *
 * Each date header links to that day's own prerendered page, `/scores/[date]` ("Day page"), so a
 * single day can be opened, bookmarked or sent on.
 */
export interface ScheduleListProps {
  groups: readonly { date: string; games: Game[] }[];
  /** A league-scoped list (`/schedule/<league>`): other leagues' sides carry their league's name. */
  scopeLeague?: LeagueId | null;
  /** The league records the games print before kickoff (GameList `records`), from the page's view. */
  records?: RecordsByGame;
  /**
   * The Scores tab's landing date for this list (lib/queries/games `getScoresLandingDate`, scoped to
   * `scopeLeague`), from the page's view: the days around it are always laid out.
   */
  landingDate: string | null;
  className?: string;
  id?: string;
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
 * overflows its placeholder. A flat 16rem per card row was ~100px too tall for an upcoming row and,
 * when this was measured, the 49 errors added up to ~3200px at 1280, which sent the rail's smooth
 * "Today" scroll past the target as the groups rendered on the way.
 *
 * Phone row: 76px, up to ~92px for a long status or FINAL + OT + NL. Card row: ~156px upcoming,
 * up to ~220px for a final with a two-line recap, plus the 16px grid gap.
 */
function rowEstimate(games: readonly Game[]): string {
  return games.some((g) => g.status !== 'final' && g.status !== 'scheduled') ? '5.75rem' : '5rem';
}
function cardEstimate(games: readonly Game[]): string {
  return games.some((g) => g.status === 'final') ? '15rem' : '11rem';
}

export function ScheduleList({ groups, scopeLeague = null, records, landingDate, className, id }: ScheduleListProps) {
  // The date BottomTabBar's Scores tab aims at on this league's list (F-1a): one helper for both,
  // read by the page's view (views/schedule/schedule-view.ts) and by the chrome's (views/site/chrome-view.ts).
  const landingDay = landingDate ? dayNumber(landingDate) : null;
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
          // Full-bleed on a phone (a negative gutter margin): `content-visibility: auto` implies paint
          // containment, so a band that pulled itself out of a gutter-inset group was clipped back
          // to the gutter — no side padding left, and the 2px non-league rule clipped away.
          //
          // No gap between days on a phone (no top margin): the date header draws a rule above and below
          // itself (DateHeader), and the 32px gaps that used to sit here cost a whole row of the
          // fold. From 768px the cards float on the canvas, and the 48px gap is what groups them.
          //
          // Landing: html's scroll-padding-top clears the top bar plus a 48px header, and
          // `.sx-dategroup`'s `scroll-margin-top: -3rem` (globals.css, F-80) hands those 48px
          // back, because the group's own header is what should sit under the bar.
          //
          // The estimate, the bleed and the margins are one class, `.sx-dategroup-est`
          // (app/globals.css): as nine utilities they were ~350 bytes on every group, once in the
          // markup and again in the RSC payload.
          className={[
            'sx-dategroup sx-dategroup-est',
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
            dayHref={scoresHref(group.date)}
            sticky
          />
          <GameList games={group.games} variant="grouped" scopeLeague={scopeLeague} records={records} />
        </section>
      ))}
    </div>
  );
}

export default ScheduleList;
