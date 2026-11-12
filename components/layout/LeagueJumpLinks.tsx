import Link from 'next/link';

import type { ArrowProps } from '../ui/Arrow';
import { standaloneName } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

/**
 * The "Jump to <league>" pills on the three league index pages (/standings, /schedule,
 * /playoffs). Every pill is in the HTML, but the league-scope stylesheet
 * (components/prefs/league-scope-css.ts) hides `.sx-jump` and shows only `.sx-jump-<id>` for
 * the remembered league, before paint. So each anchor carries exactly `sx-jump sx-jump-<id>`,
 * and this is the one place that writes them.
 *
 * A `#<id>` pill is a plain `<a>` (a fragment stays on the page); a route pill (/playoffs sends a
 * tournament league to its own page) is a `<Link prefetch={false}>`, the same rule as the league
 * chips (LeagueSwitcher.tsx, DESIGN §15.4), and the row is a per-league list
 * (tests/ui/prefetch-policy.test.ts). Each is a standalone action link (`sx-action`, DESIGN §33) with no
 * arrow in its label. It names the league by `standaloneName` ('Jump to North County', never 'Jump to
 * North', which reads as a direction).
 * The row is screen-only: `sx-print-hide` drops it from a printout (app/globals.css, @media print).
 */
export interface LeagueJumpLinksProps {
  /** Config order. */
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string }>;
  /** Each league's target; default `#<id>`. /playoffs sends a tournament league to its own page. */
  hrefs?: Readonly<Record<string, string>>;
  /** @deprecated Link labels carry no arrow (DESIGN §33); accepted and ignored. */
  arrow?: (id: LeagueId) => NonNullable<ArrowProps['dir']>;
}

export function LeagueJumpLinks({ leagues, hrefs }: LeagueJumpLinksProps) {
  return (
    <p className="sx-print-hide m-0 mt-3 flex flex-wrap gap-x-4">
      {leagues.map((league) => {
        const href = hrefs?.[league.id] ?? `#${league.id}`;
        const className = `sx-jump sx-jump-${league.id} sx-action`;
        const body = <>Jump to {standaloneName(league.id)}</>;
        return href.startsWith('#') ? (
          <a key={league.id} href={href} className={className}>
            {body}
          </a>
        ) : (
          <Link key={league.id} href={href} prefetch={false} className={className}>
            {body}
          </Link>
        );
      })}
    </p>
  );
}

export default LeagueJumpLinks;
