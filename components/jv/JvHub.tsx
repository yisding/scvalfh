import Link from 'next/link';

import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import { shortDate } from '../../lib/format';
import { JvGameList } from './JvDayGames';
import { JvFootnote } from './TeamJvGames';
import type { JvDayGroup, JvTeamCardView, LeagueJvHubView } from './jv-view';

/**
 * One league's JV games on the `/jv` hub, under its tables: the latest JV results (the last week's finals,
 * or the latest day with one) and the next JV games (the coming week's, or the next day with one), each
 * day's rows under a date strip, then one link to the league's whole JV season (`/jv/<league>`). Nothing
 * renders for a league with no listed JV game. The rows are the day view's JV rows (JvGameList), never
 * links: a JV game has no page of its own.
 */
export function JvLeagueGames({ view, leagueShort, idPrefix }: { view: LeagueJvHubView; leagueShort: string; idPrefix: string }) {
  if (view.games === 0) return null;
  return (
    <div className="mt-5">
      <div className="sx-two gap-y-4">
        {view.latest.length > 0 ? <JvDays id={`${idPrefix}-latest`} kicker="Latest results" days={view.latest} /> : null}
        {view.next.length > 0 ? <JvDays id={`${idPrefix}-next`} kicker="Next up" days={view.next} /> : null}
      </div>
      {view.latest.length > 0 || view.next.length > 0 ? <JvFootnote summary={view} /> : null}
      <p className="sx-linkrow">
        <Link href={view.scheduleHref} prefetch={false} className="sx-action">
          {leagueShort} JV schedule
        </Link>
      </p>
    </div>
  );
}

/** One list of the hub: each day's rows under a strip that names the list and, at its right end, the day. */
function JvDays({ id, kicker, days }: { id: string; kicker: string; days: readonly JvDayGroup[] }) {
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
          <JvGameList rows={day.rows} />
        </div>
      ))}
    </div>
  );
}

/**
 * Every school of a league as its JV team: the logo, the name and the JV record once there is one, each a
 * link to the school's JV section (`/teams/<slug>#jv`: its JV games and JV roster). The place a parent who
 * knows the school, not the standings, starts from. An `sx-auto` list of ruled rows.
 */
export function JvTeamIndex({ teams, id, leagueShort }: { teams: readonly JvTeamCardView[]; id: string; leagueShort: string }) {
  if (teams.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-5">
      <SectionHeader strip id={id} kicker={`${leagueShort} JV teams`} />
      <ul className="sx-auto m-0 list-none p-0">
        {teams.map(({ team, href, record, slotName }) => (
          <li
            key={team.slug}
            data-team-slug={team.slug}
            className="sx-pinnable relative flex min-h-11 min-w-0 items-center gap-2 border-b border-divider px-2 text-body"
          >
            <TeamMonogram team={team} size={24} />
            <Link href={href} prefetch={false} className="sx-rowlink min-w-0 truncate font-medium">
              {team.shortName}
              <span className="sr-only"> JV games and roster</span>
            </Link>
            <span className="sx-pin-note" hidden>
              Your team
            </span>
            <span className="sx-num ml-auto shrink-0 text-ink-2">{slotName ? `${slotName} JV` : (record ?? '')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
