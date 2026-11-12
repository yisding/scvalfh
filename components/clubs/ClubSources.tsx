import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import type { ClubHostLink, ClubPageView } from './club-view';

/**
 * A club page's "Where this comes from" (DESIGN §33): the club's own roster pages, then the pages
 * the club record was read from, then when. How players are matched is said once, on /about, which
 * the last line links.
 *
 * The roster pages are why the players section can stay narrow: a club's own roster names many more
 * players than the tracked varsity rows, and those are linked, never copied (SPEC §1.1j2, the
 * privacy posture). A club with no public roster page says that instead, which is what the data
 * can back; it does not claim the club has more players than the page lists.
 *
 * Each link is followed by its host, so a reader knows where it goes before opening it. Link text
 * is the club record's short name for the page ("Program overview", "NCFHA youth club directory")
 * and wraps; nothing here is `nowrap`. A page that is one of the club's rosters is listed once,
 * under the rosters: listing it again under "Pages about the club" would repeat the same link and
 * name. (That heading, not "About the club": three clubs have a page called "About the club".)
 */

function HostList({ links }: { links: ClubHostLink[] }) {
  return (
    <ul className="m-0 list-none p-0">
      {links.map((link) => (
        <li key={link.url} className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <ExternalLink href={link.url} className="sx-action whitespace-normal">
            {link.label}
          </ExternalLink>
          <span className="text-cell text-ink-2">{link.host}</span>
        </li>
      ))}
    </ul>
  );
}

export interface ClubSourcesProps {
  view: ClubPageView;
}

export function ClubSources({ view }: ClubSourcesProps) {
  return (
    <div>
      <p className="sx-note mt-0 max-w-prose">
        {view.rosterPages.length > 0
          ? `The club’s own rosters list many more players than this page does. Only players on the ${view.trackedTeams} varsity rosters this site tracks are named here; the club’s rosters are linked below instead.`
          : `We found no public roster page naming this club’s players. Only players on the ${view.trackedTeams} varsity rosters this site tracks are named here.`}
      </p>
      <div className="sx-auto mt-4">
        {view.rosterPages.length > 0 ? (
          <div className="mb-4">
            <h3 className="m-0 text-lead text-ink">The club&rsquo;s own rosters</h3>
            <HostList links={view.rosterPages} />
          </div>
        ) : null}
        <div className="mb-4">
          <h3 className="m-0 text-lead text-ink">Pages about the club</h3>
          <HostList links={view.sources} />
        </div>
      </div>
      <p className="sx-note mt-0">
        Read from these pages on {view.checkedOn}.{' '}
        <Link href="/about#clubs-matched" prefetch={false} className="sx-link">
          How players are matched
        </Link>
      </p>
    </div>
  );
}

export default ClubSources;
