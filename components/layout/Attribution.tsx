import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import LastUpdated from '../ui/LastUpdated';
import { SOURCE_LINKS } from '../../lib/season';

/**
 * The footer that ends EVERY page (DESIGN §1.3, §7.15; SPEC §6).
 *
 * "Data from MaxPreps and SBLive/SI" with real deep links, the snapshot timestamp in Pacific, a
 * link to /about, and the not-affiliated line. Always visible, never a tooltip. The attribution
 * posture in SPEC §6 is the reason it is not negotiable: we store derived records, deep-link back
 * on every row, and say on every page where the numbers came from.
 *
 * `links` carries the page-specific deep links — the team's or the game's own source page.
 */
export interface AttributionProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). */
  now?: string;
  links?: { label: string; href: string }[];
  /** "Prior-season data from scval.com" on /history. */
  extraCredit?: string;
  className?: string;
}

export function Attribution({ snapshotAt, now, links, extraCredit, className }: AttributionProps) {
  return (
    <footer
      className={`mt-8 border-t border-hairline px-gutter py-4 text-meta text-ink-2 md:px-gutter-lg${
        className ? ` ${className}` : ''
      }`}
    >
      <div className="mx-auto max-w-content space-y-1.5">
        <p className="m-0">
          Data from <ExternalLink href={SOURCE_LINKS.maxpreps}>MaxPreps</ExternalLink> and{' '}
          <ExternalLink href={SOURCE_LINKS.sblive}>SBLive/SI</ExternalLink>. Division alignment and
          the by-laws from <ExternalLink href={SOURCE_LINKS.scval}>SCVAL</ExternalLink>; playoff
          dates and format from <ExternalLink href={SOURCE_LINKS.ccs}>CIF-CCS</ExternalLink>.
        </p>
        {/* The deep links and "About & sources" are standalone actions, not words in a sentence, so
            each takes its own 24px box (WCAG 2.5.8). The prose links in the paragraph above do not:
            they sit inside a sentence, which is the case 2.5.8 exempts. */}
        {links && links.length > 0 ? (
          <p className="m-0 flex flex-wrap gap-x-3 gap-y-1">
            {links.map((l) => (
              <ExternalLink key={l.href} href={l.href} className="sx-action">
                {l.label}
              </ExternalLink>
            ))}
          </p>
        ) : null}
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <LastUpdated at={snapshotAt} now={now} />
          <span aria-hidden="true">&middot;</span>
          <Link href="/about" className="sx-action text-accent hover:underline">
            About &amp; sources
          </Link>
        </p>
        <p className="m-0 max-w-[62ch] text-ink-3">
          Unofficial fan site. Not affiliated with SCVAL, CIF-CCS, MaxPreps or Sports Illustrated.
          Records are computed from published game results and may differ from official standings.
          {extraCredit ? ` ${extraCredit}` : ''}
        </p>
      </div>
    </footer>
  );
}

export default Attribution;
