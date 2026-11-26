import Link from 'next/link';

import PageHeader from '../layout/PageHeader';
import ExternalLink from '../ui/ExternalLink';
import FestivalFreshness from './FestivalFreshness';
import { buildChrome } from './hub-view';

/**
 * The head of every festival page (DESIGN §35 §6): the page's title and one meta line, the festival's tab row
 * (Overview · Schedule · one tab per division · Clubs; it scrolls sideways on a phone, `.sx-tabs`), and the
 * freshness line: when the scores were read, in ET and PT, and from where, with the client's "New scores are in"
 * notice beside it.
 *
 * `current` lights a tab: `aria-current="page"` on the tab's own page, `"true"` on a page under it (a team page
 * under its division, a club page under Clubs), which stays a link back.
 */
export interface FestivalChromeProps {
  title: string;
  meta?: React.ReactNode;
  current: string;
  exact?: boolean;
  /** Under the header: a page's own controls (the Follow button). */
  children?: React.ReactNode;
}

export function FestivalChrome({ title, meta, current, exact = true, children }: FestivalChromeProps) {
  const chrome = buildChrome();
  return (
    <>
      <PageHeader title={title} meta={meta}>
        <nav aria-label="Festival" className="sx-print-hide">
          <ul className="sx-tabs">
            {chrome.tabs.map((tab) => (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  prefetch={false}
                  className="sx-tab"
                  aria-current={tab.id === current ? (exact ? 'page' : 'true') : undefined}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {/* The stamp FestivalFreshness polls for (FEST_STAMP_ATTR in freshness-poll.ts): a stamp of the results
            alone, which moves only when a score, a pool order or a placement team does (not with TourneyMachine's
            hourly version bumps, which change fetchedAt). */}
        <p className="m-0 text-cell text-ink-2" data-fest-stamp={chrome.resultsStamp}>
          Scores as of {chrome.stamp}, from{' '}
          <ExternalLink href={chrome.resultsUrl} arrow={false}>
            TourneyMachine
          </ExternalLink>
        </p>
        <FestivalFreshness complete={chrome.complete} stamp={chrome.resultsStamp} />
      </div>
      {children}
    </>
  );
}

export default FestivalChrome;
