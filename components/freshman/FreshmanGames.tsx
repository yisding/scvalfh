import Link from 'next/link';

import { GAME_LOG_ROW_GRID, GameLogRowBody } from '../game-row/GameLogRow';
import { JvGameList } from '../jv/JvDayGames';
import type { JvDayGroup, JvRowView } from '../jv/jv-view';
import DateHeader from '../schedule/DateHeader';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import { shortDate } from '../../lib/format';
import { FRESHMAN_LEVEL } from '../words/level-words';
import type { FreshmanTeamCardView, LeagueFreshmanHubView, LeagueFreshmanScheduleView, TeamFreshmanView } from './freshman-view';

/**
 * The freshman level's lists (girls soccer and boys basketball): a team page's "Freshman games", a day page's freshman
 * block, the `/freshman` hub's per-league lists and team index, and `/freshman/<league>`. Each is the JV list it
 * mirrors (components/jv/), cut to what the level has: MaxPreps alone (no † score from another source), no tables
 * (no league or non-league chip), and every row a link to the freshman game's own page (app/freshman/game/[id]).
 */

/**
 * The one line under every freshman list: where the games come from and what they count for, linked to the hub's
 * explanation (`/freshman#about`). The link sits inside the line (WCAG 2.5.8's inline exception).
 */
export function FreshmanFootnote({ className }: { className?: string }) {
  return (
    <p className={['sx-note', className].filter(Boolean).join(' ')}>
      From MaxPreps’ freshman schedules; in no varsity or JV record.{' '}
      <Link href="/freshman#about" prefetch={false} className="sx-link inline-flex min-h-6 items-center">
        How freshman games are shown
      </Link>
    </p>
  );
}

/** A team page's freshman games: the varsity log's rows, each a link to the game's page, then MaxPreps' schedule. */
export function TeamFreshmanGames({ view, slug }: { view: TeamFreshmanView; slug: string }) {
  return (
    <>
      {/* The section spans the page from 1024: two columns of rows, read down then across. */}
      <ol className="sx-list lg:columns-2 lg:gap-x-10 [&>li]:break-inside-avoid">
        {view.rows.map(({ game, href }) => (
          <li key={game.contestId}>
            <Link href={href} prefetch={false} className={`sx-tap no-underline ${GAME_LOG_ROW_GRID}`}>
              <GameLogRowBody game={game} perspective={slug} showChips={false} />
            </Link>
          </li>
        ))}
      </ol>
      <FreshmanFootnote />
      {view.maxprepsUrl ? (
        <ul className="sx-linkrow">
          <li>
            <ExternalLink href={view.maxprepsUrl} className="sx-action">
              MaxPreps freshman schedule
            </ExternalLink>
          </li>
        </ul>
      ) : null}
    </>
  );
}

/** A day's freshman games (the day page's `#freshman` block, or one league's slice of it), then the footnote. */
export function FreshmanDayGames({ rows }: { rows: readonly JvRowView[] }) {
  return (
    <>
      <JvGameList rows={rows} levelLabel={FRESHMAN_LEVEL.longTitle} />
      <FreshmanFootnote />
    </>
  );
}

/** One list of the hub: each day's rows under a strip that names the list and, at its right end, the day. */
function FreshmanDays({ id, kicker, days }: { id: string; kicker: string; days: readonly JvDayGroup[] }) {
  return (
    <div className="min-w-0">
      {days.map((day, index) => (
        <div key={day.dateKey}>
          <div className="sx-strip" id={index === 0 ? id : undefined}>
            <h3 className="m-0 text-lead text-ink">{kicker}</h3>
            <div className="sx-strip-end">
              <span>
                <time dateTime={day.dateKey}>{shortDate(day.dateKey)}</time>
              </span>
            </div>
          </div>
          <JvGameList rows={day.rows} levelLabel={FRESHMAN_LEVEL.longTitle} />
        </div>
      ))}
    </div>
  );
}

/** One league's freshman games on the hub: the latest results and the next games, then its whole freshman season. */
export function FreshmanLeagueGames({ view, leagueShort, idPrefix }: { view: LeagueFreshmanHubView; leagueShort: string; idPrefix: string }) {
  if (view.games === 0) return null;
  return (
    <div className="mt-5">
      <div className="sx-two gap-y-4">
        {view.latest.length > 0 ? <FreshmanDays id={`${idPrefix}-latest`} kicker="Latest results" days={view.latest} /> : null}
        {view.next.length > 0 ? <FreshmanDays id={`${idPrefix}-next`} kicker="Next up" days={view.next} /> : null}
      </div>
      <p className="sx-linkrow">
        <Link href={view.scheduleHref} prefetch={false} className="sx-action">
          {leagueShort} {FRESHMAN_LEVEL.long} schedule
        </Link>
      </p>
    </div>
  );
}

/** The league's schools with freshman games, each a link to its team page's freshman section, with its record. */
export function FreshmanTeamIndex({ teams, id, leagueShort }: { teams: readonly FreshmanTeamCardView[]; id: string; leagueShort: string }) {
  if (teams.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-5">
      <SectionHeader strip id={id} kicker={`${leagueShort} ${FRESHMAN_LEVEL.long} teams`} />
      <ul className="sx-auto m-0 list-none p-0">
        {teams.map(({ team, href, record }) => (
          <li
            key={team.slug}
            data-team-slug={team.slug}
            className="sx-pinnable relative flex min-h-11 min-w-0 items-center gap-2 border-b border-divider px-2 text-body"
          >
            <TeamMonogram team={team} size={24} />
            <Link href={href} prefetch={false} className="sx-rowlink min-w-0 truncate font-medium">
              {team.shortName}
              <span className="sr-only"> {FRESHMAN_LEVEL.long} games</span>
            </Link>
            <span className="sx-pin-note" hidden>
              Your team
            </span>
            <span className="sx-num ml-auto shrink-0 text-ink-2">{record ?? ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * `/freshman/<league>`: every freshman game of the league, a group per date (`#d-<date>`), oldest first. A date with
 * a varsity game links its day page's freshman block; any other date is on this page and the team pages alone.
 */
export function FreshmanSchedule({ view, varsityDates }: { view: LeagueFreshmanScheduleView; varsityDates: ReadonlySet<string> }) {
  return (
    <>
      {view.days.map((day) => (
        <section key={day.dateKey} id={`d-${day.dateKey}`} className="mt-4 first:mt-0">
          <DateHeader
            date={day.dateKey}
            count={day.rows.length}
            dayHref={varsityDates.has(day.dateKey) ? `/scores/${day.dateKey}#freshman` : undefined}
            sticky
          />
          <JvGameList rows={day.rows} levelLabel={FRESHMAN_LEVEL.longTitle} />
        </section>
      ))}
      <FreshmanFootnote />
    </>
  );
}
