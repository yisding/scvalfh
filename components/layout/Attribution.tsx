import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import LastUpdated from '../ui/LastUpdated';
import { SOURCE_LINKS } from '../../lib/season';

/**
 * The footer that ends EVERY page (DESIGN §1.3, §7.15; SPEC §6).
 *
 * "Data from MaxPreps and SBLive/SI" with real deep links, the snapshot timestamp in Pacific, a
 * link to /about and one to last season's archive, and the not-affiliated line. Always visible, never a tooltip. The attribution
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
    // No top margin on phone: every page wrapper already ends with `pb-section-lg` (56px), and a
    // second 56px here left a 112px blank band that read like the page had stopped loading.
    // From 768px a modest extra 32px lets the footer read as the end of the page, not a section.
    <footer
      className={['border-t border-hairline md:mt-8', className]
        .filter(Boolean)
        .join(' ')}
    >
      {/* The padding lives INSIDE the max-w-content box, so the footer's left edge lines up with
          <main> and the header at every width. From 768px: sources on the left, the stamp and
          the actions on the right, the disclaimer across both under a divider. */}
      <div className="mx-auto max-w-content px-gutter py-10 text-meta text-ink-2 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-12 md:gap-y-4 md:px-gutter-lg md:py-12 xl:px-gutter-xl">
        <p className="m-0 max-w-prose">
          Data from <ExternalLink href={SOURCE_LINKS.maxpreps}>MaxPreps</ExternalLink> and{' '}
          <ExternalLink href={SOURCE_LINKS.sblive}>SBLive/SI</ExternalLink>. Division alignment and
          the by-laws from <ExternalLink href={SOURCE_LINKS.scval}>SCVAL</ExternalLink>; playoff
          dates and format from <ExternalLink href={SOURCE_LINKS.ccs}>CIF-CCS</ExternalLink>.
        </p>
        {/* The deep links, "About & sources" and the archive link are standalone actions, not words in a sentence, so
            each takes its own 24px box (`sx-action`, WCAG 2.5.8). The prose links in the paragraph
            above do not: they sit inside a sentence, which is the case 2.5.8 exempts. */}
        <div className="mt-4 flex flex-col gap-2 md:mt-0 md:items-end">
          <LastUpdated at={snapshotAt} now={now} />
          <Link href="/about" className="sx-action text-accent hover:underline">
            About &amp; sources
          </Link>
          {/* The phone's only way to last season: the five-tab bar has no History entry (the
              desktop nav does), so the footer carries it at every width. */}
          <Link href="/history/2025-26" prefetch={false} className="sx-action text-accent hover:underline">
            2025-26 season archive
          </Link>
          {links && links.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 md:justify-end">
              {links.map((l) => (
                <ExternalLink key={l.href} href={l.href} className="sx-action">
                  {l.label}
                </ExternalLink>
              ))}
            </div>
          ) : null}
        </div>
        {/* The divider spans the whole footer grid; only the sentence is capped at 65ch. */}
        <div className="mt-6 border-t border-divider pt-4 md:col-span-2">
          <p className="m-0 max-w-prose text-meta text-ink-3">
            Unofficial fan site. Not affiliated with SCVAL, CIF-CCS, MaxPreps or Sports Illustrated.
            Records are computed from published game results and may differ from official standings.
            {extraCredit ? ` ${extraCredit}` : ''}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Attribution;
