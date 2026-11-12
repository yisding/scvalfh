import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';
import { navLeagueHrefs } from './nav-targets';
import { NAV_LABELS } from './site';

/**
 * The header nav (DESIGN §33). Six sections. The wordmark is the home link, and home is the Scores
 * page, so there is no "Home" and "Scores" is also current on `/` (NavLink). The first four are, in
 * order, the phone bar's tabs. History and About are in the footer and the phone More sheet.
 * tests/ui/header-fit.test.ts has a measured width for every label here and fails when one is added
 * without it.
 */
export const TOP_LINKS: ReadonlyArray<{ href: string; label: string; srSuffix?: string }> = [
  { href: '/schedule', label: NAV_LABELS.scores },
  { href: '/standings', label: NAV_LABELS.standings },
  { href: '/playoffs', label: NAV_LABELS.playoffs },
  { href: '/teams', label: NAV_LABELS.teams },
  { href: '/leaders', label: NAV_LABELS.leaders },
  // The suffix is short on purpose: the nav is in every page's first-load JS.
  { href: '/jv', label: NAV_LABELS.jv, srSuffix: ' (junior varsity)' },
];

export interface TopNavProps {
  className?: string;
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

export function TopNav({ className, slugLeague }: TopNavProps) {
  const hrefs = navLeagueHrefs();
  return (
    <nav aria-label="Main" className={className}>
      <ul>
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
