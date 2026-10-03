import { CCS_LEAGUE_IDS, LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';

/**
 * The league-aware targets of the three nav entries that have a per-league page (SPEC §8.3),
 * built once from the league config and handed to the client `NavLink` as plain, serializable
 * objects. Scores → `/schedule/<id>`; Table/Standings → `/standings/<id>`; Playoffs → the league's
 * section of the CCS page (`/playoffs#<id>`) for a CCS-ladder league, its own tournament page
 * (`/playoffs/<id>`) for a league-tournament league. Every other entry keeps its one href.
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
    '/standings': per((id) => `/standings/${id}`),
    '/playoffs': per((id) =>
      TOURNAMENT_LEAGUE_IDS.includes(id) ? `/playoffs/${id}` : CCS_LEAGUE_IDS.includes(id) ? `/playoffs#${id}` : null,
    ),
  };
}

/**
 * The desktop nav: eight links, no sidebar, no bottom bar (DESIGN §1.3, §16). History keeps its
 * short visible label; an sr-only suffix says what it holds (its page is titled with the same
 * words). Leaders has no phone tab (the bar keeps its five); the footer links it at every width.
 */
export const TOP_LINKS: ReadonlyArray<{ href: string; label: string; srSuffix?: string }> = [
  { href: '/', label: 'Home' },
  { href: '/standings', label: 'Standings' },
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
