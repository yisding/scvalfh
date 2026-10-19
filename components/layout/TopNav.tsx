import type { LeagueId, TeamSlug } from '@/lib/model/ids';
import { NAV_DESTINATIONS, navLeagueHrefs } from '@/views/site/nav-targets';

import NavLink from './NavLink';

export interface TopNavProps {
  className?: string;
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/**
 * The desktop nav: seven links, no sidebar, no bottom bar (DESIGN §1.3, §16, §18), rendered from
 * `NAV_DESTINATIONS` (views/site/nav-targets.ts), which also feeds the 404 page's cards.
 */
export function TopNav({ className, slugLeague }: TopNavProps) {
  const hrefs = navLeagueHrefs();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex list-none items-center gap-0.5 p-0">
        {NAV_DESTINATIONS.map((link) => (
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
