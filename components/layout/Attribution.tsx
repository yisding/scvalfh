import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import { getSitePhase } from '../../lib/data';
import { RegionSwitcher } from '../prefs/LeagueSwitcher';
import ThemeToggle from '../prefs/ThemeToggle';

import LastUpdated from './LastUpdated';
import { DATA_CORRECTIONS_URL, NAV_LABELS } from './site';

/**
 * The footer that ends EVERY page (DESIGN §33; SPEC §6): the same navy band as the header. A site
 * index in the header's own words, the two preferences as plain text buttons ("Dark mode",
 * "Switch to SoCal": not switches), then two lines: when the data was last updated (the long form of
 * the stamp, linked to how updates work), and where the scores come from and that the site is
 * unofficial. Nothing decorative.
 *
 * The long forms (every source and league rules link, the scope note, the full not-affiliated line)
 * are components/layout/site-prose.tsx, rendered on /about. Saying where the numbers came from on
 * every page is not negotiable (SPEC §6): the line here names both sources, and "About" is one tap
 * from the detail.
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

const INDEX: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/schedule', label: NAV_LABELS.scores },
  { href: '/standings', label: NAV_LABELS.standings },
  { href: '/playoffs', label: NAV_LABELS.playoffs },
  { href: '/teams', label: NAV_LABELS.teams },
  { href: '/leaders', label: NAV_LABELS.leaders },
  { href: '/jv', label: NAV_LABELS.jv },
  { href: '/history/2025-26', label: NAV_LABELS.history },
  { href: '/about', label: NAV_LABELS.about },
];

export function Attribution({ snapshotAt, now, className }: AttributionProps) {
  return (
    <footer className={['sx-foot sx-print-hide', className].filter(Boolean).join(' ')}>
      <div className="sx-foot-inner">
        <ul className="sx-foot-index" id="site-index">
          {INDEX.map((item) => (
            <li key={item.href}>
              <Link href={item.href} prefetch={false}>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <ExternalLink href={DATA_CORRECTIONS_URL}>{NAV_LABELS.report}</ExternalLink>
          </li>
        </ul>
        <div className="sx-foot-prefs">
          <ThemeToggle />
          <RegionSwitcher face="text" className="sx-textbtn" />
        </div>
        <p className="sx-foot-line">
          <LastUpdated variant="stamp" at={snapshotAt} now={now} seasonComplete={getSitePhase() === 'complete'} />. All
          times Pacific.
        </p>
        <p className="sx-foot-line">
          Scores come from MaxPreps and SI.com. This is an unofficial site, not affiliated with any school, league or
          CIF section.
        </p>
      </div>
    </footer>
  );
}

export default Attribution;
