import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import type { ClubHostLink, ClubPageView } from './club-view';

/**
 * A club page's "Where this comes from" (DESIGN §16.1): the club's own roster pages, then the pages
 * the club record was read from, then when, and how players are matched.
 *
 * The roster pages are why the players section can stay narrow: a club's own roster names many more
 * players than the tracked varsity rows, and those are linked, never copied (SPEC §1.1j2, the
 * privacy posture). A club with no public roster page says that instead, which is what the data
 * can back; it does not claim the club has more players than the page lists.
 *
 * Each link is followed by its host, so a reader knows where it goes before opening it. Link text
 * is the source's own description and wraps; nothing here is `nowrap`.
 */

function HostList({ links }: { links: ClubHostLink[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-meta">
      {links.map((link) => (
        <li key={link.url} className="min-w-0">
          <ExternalLink href={link.url} className="sx-action gap-1">
            {link.label}
          </ExternalLink>
          <span className="text-ink-3"> &middot; {link.host}</span>
        </li>
      ))}
    </ul>
  );
}

export function ClubSources({ view }: { view: ClubPageView }) {
  return (
    <div>
      <p className="m-0 max-w-prose text-meta text-ink-2">
        {view.rosterPages.length > 0
          ? `The club’s own rosters list many more players than this page does. Only players on the ${view.trackedTeams} varsity rosters this site tracks are named here; the club’s rosters are linked below instead.`
          : `We found no public roster page for this club. Only players on the ${view.trackedTeams} varsity rosters this site tracks are named here.`}
      </p>
      {view.rosterPages.length > 0 ? (
        <div className="mt-6">
          <SectionHeader as="h3" size="label" kicker="The club’s own rosters" />
          <HostList links={view.rosterPages} />
        </div>
      ) : null}
      <div className="mt-6">
        <SectionHeader as="h3" size="label" kicker="About the club" />
        <HostList links={view.sources} />
      </div>
      <p className="mt-4 mb-0 text-meta text-ink-3">
        Read from these pages on {view.checkedOn}.{' '}
        <Link href="/clubs#how-matched" prefetch={false} className="text-accent hover:underline">
          How players are matched
        </Link>
        .
      </p>
    </div>
  );
}

export default ClubSources;
