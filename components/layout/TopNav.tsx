import { CCS_LEAGUE_IDS, LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';

/**
 * The league-aware targets of the three nav entries that have a per-league place (SPEC §8.3),
 * built once from the league config and handed to the client `NavLink` as plain, serializable
 * objects. Scores → `/schedule/<id>`; Teams → the league's section of the teams-and-standings page
 * (`/teams#<id>`, which took over the old Table tab's job of opening your league's tables, DESIGN
 * §18); Playoffs → the league's section of the CCS page (`/playoffs#<id>`) for a CCS-ladder league,
 * its own tournament page (`/playoffs/<id>`) for a league-tournament league, and its pointer card on
 * the CCS page (`/playoffs#<id>`) for an unbracketed league (the EAL: no bracket, no page of its
 * own). Every other entry keeps its one href.
 */
export function navLeagueHrefs(): Readonly<Record<string, Readonly<Record<LeagueId, string>>>> {
  const per = (f: (id: LeagueId) => string | null) =>
    Object.fromEntries(
      LEAGUE_IDS.flatMap((id) => {
        const href = f(id);
        return href === null ? [] : [[id, href] as const];
      }),
    );
  return {
    '/schedule': per((id) => `/schedule/${id}`),
    '/teams': per((id) => `/teams#${id}`),
    '/playoffs': per((id) =>
      TOURNAMENT_LEAGUE_IDS.includes(id)
        ? `/playoffs/${id}`
        : CCS_LEAGUE_IDS.includes(id) || UNBRACKETED_LEAGUE_IDS.includes(id)
          ? `/playoffs#${id}`
          : null,
    ),
  };
}

/**
 * The desktop nav: seven links, no sidebar, no bottom bar (DESIGN §1.3, §16, §18). It matches the
 * phone bar: Teams is the teams-and-standings page (the standings live there, and Teams stays lit
 * on every /standings page), so there is no separate Standings link. History keeps its short
 * visible label; an sr-only suffix says what it holds (its page is titled with the same words).
 */
const TOP_LINKS: ReadonlyArray<{ href: string; label: string; srSuffix?: string }> = [
  { href: '/', label: 'Home' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/teams', label: 'Teams' },
  { href: '/leaders', label: 'Leaders' },
  { href: '/playoffs', label: 'Playoffs' },
  { href: '/history/2025-26', label: 'History', srSuffix: ' (2025-26 final standings)' },
  { href: '/about', label: 'About' },
];

export function TopNav({
  className,
  slugLeague,
}: {
  className?: string;
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}) {
  const hrefs = navLeagueHrefs();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex list-none items-center gap-0.5 p-0">
        {TOP_LINKS.map((link) => (
          <li key={link.href}>
            <NavLink
              href={link.href}
              variant="top"
              label={link.label}
              srSuffix={link.srSuffix}
              leagueHrefs={hrefs[link.href]}
              // Only a league-aware link needs the map; the same object reference is passed to
              // each, so the Flight serializer can write it once and refer back to it.
              slugLeague={hrefs[link.href] ? slugLeague : undefined}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default TopNav;
