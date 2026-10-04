import Link from 'next/link';

import { Fragment } from 'react';

import ExternalLink from '../ui/ExternalLink';
import LastUpdated from '../ui/LastUpdated';
import { getSitePhase } from '../../lib/data';
import { LEAGUES, SECTIONS, getSection } from '../../lib/leagues';
import type { LeagueConfig } from '../../lib/leagues';
import { SOURCE_LINKS } from '../../lib/season';

import { SITE_SCOPE_NOTE } from './site-url';

/**
 * The footer that ends EVERY page (DESIGN §1.3, §7.15; SPEC §6).
 *
 * "Data from MaxPreps and High School on SI (si.com)" with real deep links, the leagues whose
 * alignment and rules the site follows (each linked to its official site), the scope note naming
 * exactly what is covered (SPEC §11), the snapshot timestamp in Pacific, a link to /about and one
 * to last season's archive (2025-26 final standings, by league), and
 * the not-affiliated line. The league and section lists are built from lib/leagues.ts in config
 * order, so they read exactly "SCVAL, BVAL, PCAL and MCAL; EAL rules from the CIF Northern
 * Section" and can never drift from the config. A league with no document of its own (every
 * division `official.mode === 'none'`: the EAL) takes its rules from its section's guidelines, so
 * it is named in the second clause, linked to its `officialUrl`, not credited with alignment.
 *
 * Once every league's season is over (`getSitePhase() === 'complete'`) the stamp says so instead
 * of turning into the stale warning. Always visible, never a tooltip. The attribution posture in
 * SPEC §6 is the reason it is not negotiable: we store derived records, deep-link back on every
 * row, and say on every page where the numbers came from.
 */
export interface AttributionProps {
  /** ISO UTC instant — `snapshot.fetchedAt`. */
  snapshotAt: string;
  /** The instant staleness is measured against (the build instant). */
  now?: string;
  className?: string;
}

/** Leagues that publish no schedule or standings document of their own (the EAL). */
function hasNoDocument(league: LeagueConfig): boolean {
  return league.divisions.every((d) => d.official.mode === 'none');
}

/** 'A, B, C and D' */
function joined(items: readonly React.ReactNode[]): React.ReactNode[] {
  return items.map((item, i) => (
    <Fragment key={i}>
      {i === 0 ? null : i === items.length - 1 ? ' and ' : ', '}
      {item}
    </Fragment>
  ));
}

export function Attribution({ snapshotAt, now, className }: AttributionProps) {
  const seasonComplete = getSitePhase() === 'complete';
  const notAffiliated = [
    ...LEAGUES.map((l) => l.shortName),
    ...SECTIONS.map((s) => `CIF-${s.shortName}`),
    'MaxPreps',
  ].join(', ');
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
        <div className="max-w-prose">
          <p className="m-0">
            Data from{' '}
            <ExternalLink href={SOURCE_LINKS.maxpreps} arrow={false}>
              MaxPreps
            </ExternalLink>{' '}
            and{' '}
            <ExternalLink href={SOURCE_LINKS.sblive} arrow={false}>
              High School on SI (si.com)
            </ExternalLink>
            . League alignment and rules from{' '}
            {joined(
              LEAGUES.filter((l) => !hasNoDocument(l)).map((l) => (
                <ExternalLink key={l.id} href={l.officialUrl} arrow={false}>
                  {l.shortName}
                </ExternalLink>
              )),
            )}
            {LEAGUES.filter(hasNoDocument).map((l) => (
              <Fragment key={l.id}>
                ; {l.shortName} rules from the{' '}
                <ExternalLink href={l.officialUrl} arrow={false}>
                  CIF {getSection(l.sectionId).name}
                </ExternalLink>
              </Fragment>
            ))}
            .
          </p>
          <p className="mt-2 mb-0">{SITE_SCOPE_NOTE}</p>
        </div>
        {/* "About & sources" and the archive link are standalone actions, not words in a
            sentence, so each takes its own 24px box (`sx-action`, WCAG 2.5.8). The prose links in
            the paragraph above do not: they sit inside a sentence, which is the case 2.5.8
            exempts. Both links carry `prefetch={false}` like the nav
            (components/layout/NavLink.tsx): the footer is layout chrome on every page and is in
            the first viewport on short pages, so Next 16's `auto` would download /about in full
            from every route. */}
        <div className="mt-4 flex flex-col gap-2 md:mt-0 md:items-end">
          <LastUpdated at={snapshotAt} now={now} seasonComplete={seasonComplete} />
          <Link href="/about" prefetch={false} className="sx-action text-accent hover:underline">
            About &amp; sources
          </Link>
          {/* The phone's only way to last season: the five-tab bar has no History entry (the
              desktop nav does), so the footer carries it at every width. */}
          <Link href="/history/2025-26" prefetch={false} className="sx-action text-accent hover:underline">
            2025-26 archive
          </Link>
        </div>
        {/* The divider spans the whole footer grid; only the sentence is capped at the prose
            measure (32em, `--max-width-prose`). */}
        <div className="mt-6 border-t border-divider pt-4 md:col-span-2">
          <p className="m-0 max-w-prose text-meta text-ink-3">
            Unofficial; not affiliated with {notAffiliated} or SI. Records are computed from
            published game results and may differ from official standings.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Attribution;
