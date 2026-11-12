import { getScoresLandingDate } from '../../lib/data';
import { dayNumber } from '../../lib/format';
import type { Game, LeagueId } from '../../lib/types';

import { gameKind } from '../ui/describe-game';

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
 * Where a `#2026-09-24` anchor lands (the month links, a pasted link): html's `scroll-padding-top`
 * and `.sx-dategroup`'s `scroll-margin-top` (globals.css) park the group's own date strip under the
 * header.
 *
 * A jump only lands where it was aimed if the groups above the target keep their heights while the
 * scroll happens. A hard load gets that from the browser, which re-runs the fragment scroll while
 * the page settles; a client navigation (the Scores tab, `router.push`) scrolls ONCE, and the
 * groups that then render around the target swap their estimates for real heights and shove it off
 * its mark. So the days around the Scores tab's landing date (lib/data `getScoresLandingDate`)
 * are never skipped at all: `[content-visibility:visible]` lays them out from the first frame, and
 * the one scroll lands where the hard load does.
 *
 * Each date strip's date links to that day's own prerendered page, `/scores/[date]`.
 */
export interface ScheduleListProps {
  groups: readonly { date: string; games: Game[] }[];
  /** A league-scoped list (`/schedule/<league>`): other leagues' sides carry their league's name. */
  scopeLeague?: LeagueId | null;
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
 * Whether a date's rows note their competition ("Non-league", a postseason round): only where the
 * date mixes kinds, or holds a postseason game (whose round is a fact the strip does not carry). A
 * date of league games alone, or of non-league games alone, says nothing on each row.
 */
function notesKinds(games: readonly Game[]): boolean {
  const kinds = new Set(games.map((game) => gameKind(game)));
  return kinds.size > 1 || kinds.has('postseason');
}

export function ScheduleList({ groups, scopeLeague = null, className, id }: ScheduleListProps) {
  // The date BottomTabBar's Scores tab aims at on this league's list (F-1a): one helper for both.
  const landing = getScoresLandingDate(scopeLeague ? { league: scopeLeague } : {});
  const landingDay = landing ? dayNumber(landing) : null;
  return (
    <div id={id} className={['mt-4', className].filter(Boolean).join(' ')}>
      {groups.map((group) => (
        <section
          key={group.date}
          id={group.date}
          data-dategroup={group.date}
          // Each group states an estimate of its own height (`.sx-dategroup-est`, app/globals.css:
          // a strip, then one row per game on a phone, per row of two from 768px and of three where
          // the list reaches three columns), so a skipped group never overflows its placeholder and
          // the scrollbar does not lie; `auto` remembers the real size once the group has rendered.
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
              '--sx-r': Math.ceil(group.games.length / 2),
              '--sx-r3': Math.ceil(group.games.length / 3),
            } as React.CSSProperties
          }
        >
          <DateHeader
            date={group.date}
            count={group.games.length}
            dayHref={`/scores/${group.date}`}
            sticky
          />
          <GameList games={group.games} showChips={notesKinds(group.games)} />
        </section>
      ))}
    </div>
  );
}

export default ScheduleList;
