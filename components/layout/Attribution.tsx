import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import { getSitePhase } from '../../lib/data';

import LastUpdated from './LastUpdated';
import { DATA_CORRECTIONS_URL } from './site';

/**
 * The footer that ends EVERY page (DESIGN §33; SPEC §6): a site index, then one line that says when
 * the data was last updated, where it comes from and that the site is unofficial. About 100px at
 * 1280. The index is the phone's way to every section the tab bar's More sheet also lists, and the
 * one place the corrections thread is linked from every page.
 *
 * The long forms (every source and league rules link, the scope note, the full not-affiliated line)
 * are components/layout/site-prose.tsx, rendered on /about. Saying where the numbers came from on
 * every page is not negotiable (SPEC §6): the line here names both sources, and "About and sources"
 * is one tap from the detail.
 *
 * Every link carries `prefetch={false}` like the nav (components/layout/NavLink.tsx): the footer is
 * in the first viewport on short pages, so Next 16's `auto` would download each route in full.
 */
export interface AttributionProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). */
  now?: string;
  className?: string;
}

export function Attribution({ snapshotAt, now, className }: AttributionProps) {
  return (
    <footer className={['sx-foot sx-print-hide', className].filter(Boolean).join(' ')}>
      <div className="sx-foot-inner">
        <ul className="sx-foot-index" id="site-index">
          <li>
            <Link href="/schedule" prefetch={false}>
              Scores
            </Link>
          </li>
          <li>
            <Link href="/standings" prefetch={false}>
              Standings
            </Link>
          </li>
          <li>
            <Link href="/teams" prefetch={false}>
              Teams
            </Link>
          </li>
          <li>
            <Link href="/playoffs" prefetch={false}>
              Playoffs
            </Link>
          </li>
          <li>
            <Link href="/leaders" prefetch={false}>
              Leaders
            </Link>
          </li>
          <li>
            <Link href="/jv" prefetch={false}>
              JV
            </Link>
          </li>
          <li>
            <Link href="/history/2025-26" prefetch={false}>
              2025-26 archive
            </Link>
          </li>
          <li>
            <Link href="/about" prefetch={false}>
              About and sources
            </Link>
          </li>
          <li>
            <ExternalLink href={DATA_CORRECTIONS_URL}>Report an error</ExternalLink>
          </li>
        </ul>
        <p className="sx-foot-line">
          <LastUpdated variant="stamp" at={snapshotAt} now={now} seasonComplete={getSitePhase() === 'complete'} />{' '}
          Unofficial: scores come from MaxPreps and si.com, and this site is not affiliated with any school, league or
          CIF section.
        </p>
      </div>
    </footer>
  );
}

export default Attribution;
