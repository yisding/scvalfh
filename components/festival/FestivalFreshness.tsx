'use client';

import { useEffect, useState } from 'react';

import { pollFreshness } from './freshness-poll';

/**
 * "New scores are in" (DESIGN §35.7). The festival pages are static and a refresh is a redeploy, so a page left
 * open at the fields goes stale. While the tab is visible this asks OUR OWN origin, every 3 minutes, for one small
 * festival page and compares the scores stamp it carries (`data-fest-stamp`, the committed file's `fetchedAt`) with
 * this page's own, `stamp`; when they differ, one line offers a reload (components/festival/freshness-poll.ts says
 * why a stamp and not the ETag: ncfh.net sends none). It never reloads by itself (a reader may be mid-scroll),
 * never calls TourneyMachine, stops while the tab is hidden and after the first change, and does nothing once every
 * game is final (`complete`) or without a stamp.
 *
 * The line sits in a polite live region, so the news is announced once. Without JS there is nothing: the
 * freshness stamp beside it says how old the scores are.
 */
export function FestivalFreshness({ complete, stamp }: { complete: boolean; stamp: string }) {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    return pollFreshness({
      stamp,
      complete,
      onChange: () => setChanged(true),
      env: {
        fetch: (url, init) => fetch(url, init),
        visible: () => document.visibilityState === 'visible',
        onVisibility: (fn) => {
          document.addEventListener('visibilitychange', fn);
          return () => document.removeEventListener('visibilitychange', fn);
        },
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (id) => window.clearInterval(id as number),
      },
    });
  }, [complete, stamp]);

  return (
    <p role="status" aria-live="polite" className={changed ? 'm-0 text-meta font-semibold text-ink' : 'sr-only'}>
      {changed ? (
        <>
          New scores are in.{' '}
          <button type="button" onClick={() => window.location.reload()} className="sx-link min-h-11">
            Reload
          </button>
        </>
      ) : null}
    </p>
  );
}

export default FestivalFreshness;
