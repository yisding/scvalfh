import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';
import { navLeagueHrefs } from './nav-targets';

/**
 * The desktop nav (DESIGN §33). Six sections, then, from 1024px, a hairline divider and the two
 * quiet links. The wordmark is the home link, so there is no "Home"; "Scores" is the same word the
 * phone tab bar uses for /schedule. `quiet` links are hidden below 1024 (`.sx-mast-quiet`), where the
 * footer and the phone More sheet carry them. tests/ui/header-fit.test.ts has a measured width for
 * every label here and fails when one is added without it.
 */
export const TOP_LINKS: ReadonlyArray<{ href: string; label: string; srSuffix?: string; quiet?: boolean }> = [
  { href: '/schedule', label: 'Scores' },
  { href: '/standings', label: 'Standings' },
  { href: '/teams', label: 'Teams' },
  { href: '/playoffs', label: 'Playoffs' },
  { href: '/leaders', label: 'Leaders' },
  // The suffix is short on purpose: the nav is in every page's first-load JS.
  { href: '/jv', label: 'JV', srSuffix: ' (junior varsity)' },
  { href: '/history/2025-26', label: 'History', srSuffix: ' (2025-26 final standings)', quiet: true },
  { href: '/about', label: 'About', quiet: true },
];

const FIRST_QUIET = TOP_LINKS.findIndex((link) => link.quiet);

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
        {TOP_LINKS.flatMap((link, i) => [
          i === FIRST_QUIET ? <li key="sep" className="sx-mast-sep" aria-hidden="true" /> : null,
          <li key={link.href} className={link.quiet ? 'sx-mast-quiet' : undefined}>
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
          </li>,
        ])}
      </ul>
    </nav>
  );
}

export default TopNav;
