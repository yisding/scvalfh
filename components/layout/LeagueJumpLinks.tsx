import type { LeagueId } from '../../lib/types';
import Arrow, { type ArrowProps } from '../ui/Arrow';

/**
 * The "Jump to <league>" pills on the three league index pages (/standings, /schedule,
 * /playoffs). Every pill is in the HTML, but the league-scope stylesheet
 * (components/layout/league-scope-css.ts) hides `.sx-jump` and shows only `.sx-jump-<id>` for
 * the remembered league, before paint. So each anchor carries exactly `sx-jump sx-jump-<id>`,
 * and this is the one place that writes them.
 *
 * Plain `<a>`, not next/link: the default target is an anchor on the same page (`#<id>`). They
 * sit on the canvas, so they are canvas pills (`sx-pill-ring`) at the 44px primary height. The
 * arrow says where the target is (down the page by default) and is aria-hidden like every link
 * arrow (components/ui/Arrow.tsx).
 */
export interface LeagueJumpLinksProps {
  /** Config order. */
  leagues: ReadonlyArray<{ id: LeagueId; shortName: string }>;
  /** Each league's target; default `#<id>`. /playoffs sends a tournament league to its own page. */
  hrefs?: Readonly<Record<string, string>>;
  /** Each pill's arrow; default down. */
  arrow?: (id: LeagueId) => NonNullable<ArrowProps['dir']>;
}

export function LeagueJumpLinks({ leagues, hrefs, arrow }: LeagueJumpLinksProps) {
  return (
    <p className="m-0 mt-4 flex flex-wrap gap-2">
      {leagues.map((league) => (
        <a
          key={league.id}
          href={hrefs?.[league.id] ?? `#${league.id}`}
          className={`sx-jump sx-jump-${league.id} sx-pill sx-pill-ring min-h-11`}
        >
          Jump to {league.shortName} <Arrow dir={arrow?.(league.id) ?? 'down'} />
        </a>
      ))}
    </p>
  );
}

export default LeagueJumpLinks;
