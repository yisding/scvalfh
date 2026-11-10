import Link from 'next/link';

import Arrow from '../ui/Arrow';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';
import { plural } from '../../lib/format';
import { JvGameList } from './JvDayGames';
import { JvFootnote } from './TeamJvGames';
import type { JvDayGroup, JvTeamCardView, LeagueJvHubView } from './jv-view';

/**
 * One league's JV games on the `/jv` hub, under its tables: the latest JV results (the last week's finals,
 * or the latest day with one) and the next JV games (the coming week's, or the next day with one), each a
 * short list by day, then one link to the league's whole JV season (`/jv/<league>`). Nothing renders for a
 * league with no listed JV game. The rows are the day page's JV rows (JvGameList), never links: a JV game
 * has no page of its own.
 */
export function JvLeagueGames({ view, leagueShort, idPrefix }: { view: LeagueJvHubView; leagueShort: string; idPrefix: string }) {
  if (view.games === 0) return null;
  return (
    <div className="mt-8">
      <div className="grid gap-x-8 gap-y-8 lg:max-w-5xl lg:grid-cols-2">
        {view.latest.length > 0 ? (
          <JvDays id={`${idPrefix}-latest`} kicker="Latest JV results" days={view.latest} />
        ) : null}
        {view.next.length > 0 ? <JvDays id={`${idPrefix}-next`} kicker="Next JV games" days={view.next} /> : null}
      </div>
      {view.latest.length > 0 || view.next.length > 0 ? <JvFootnote summary={view} /> : null}
      <p className="m-0 mt-3 text-meta">
        <Link href={view.scheduleHref} prefetch={false} className="font-medium text-accent hover:underline">
          Every {leagueShort} JV game, by date <Arrow />
        </Link>
        <span className="text-ink-3">
          {' '}
          &middot; {plural(view.games, 'game')} listed, {view.finals} final
        </span>
      </p>
    </div>
  );
}

function JvDays({ id, kicker, days }: { id: string; kicker: string; days: readonly JvDayGroup[] }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <SectionHeader as="h3" id={id} kicker={kicker} />
      {days.map((day) => (
        <div key={day.dateKey} className="mt-3 first:mt-0">
          <p className="m-0 mb-1 text-meta font-semibold text-ink-2">
            <time dateTime={day.dateKey}>{day.label}</time>
          </p>
          <JvGameList rows={day.rows} />
        </div>
      ))}
    </section>
  );
}

/**
 * Every school of a league as its JV team: the tile, the name, the JV record once there is one, the next JV
 * game, and one link to the school's JV section (`/teams/<slug>#jv`: its JV games and JV roster). The place a
 * parent who knows the school, not the table, starts from.
 */
export function JvTeamIndex({ teams, id, leagueShort }: { teams: readonly JvTeamCardView[]; id: string; leagueShort: string }) {
  if (teams.length === 0) return null;
  return (
    <section aria-labelledby={id} className="mt-8">
      <SectionHeader as="h3" id={id} kicker={`${leagueShort} JV teams`} meta={`${teams.length} schools`} />
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:max-w-5xl lg:grid-cols-3">
        {teams.map(({ team, href, record, next, games, slotName }) => (
          <li key={team.slug} data-team-slug={team.slug} className="sx-card relative min-w-0 px-3 py-2">
            <Link
              href={href}
              prefetch={false}
              className="flex min-h-11 items-center gap-2 text-ink no-underline hover:underline after:absolute after:inset-0 after:content-['']"
            >
              <TeamMonogram team={team} size={28} />
              <span className="min-w-0 flex-1 truncate text-body font-medium">
                {team.shortName}
                <span className="sr-only"> JV games and roster</span>
              </span>
              <span className="sx-num shrink-0 text-cell text-ink-2">{record ?? ''}</span>
            </Link>
            <p className="m-0 truncate text-meta text-ink-3">
              {slotName
                ? `${slotName} plays its JV games`
                : games === 0
                  ? 'No JV game listed yet'
                  : next
                    ? `Next: ${next}`
                    : `${plural(games, 'game')} listed`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
