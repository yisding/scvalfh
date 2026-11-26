'use client';

import { useEffect, useState } from 'react';

/**
 * "New scores are in" (DESIGN §35 §7). The festival pages are static and a refresh is a redeploy, so a page left
 * open at the fields goes stale. While the tab is visible this asks OUR OWN origin, every 3 minutes, for the
 * page's headers (`HEAD`, `cache: 'no-store'`) and compares its ETag (else Last-Modified) with the first one it
 * saw; when it changes, one line offers a reload. It never reloads by itself (a reader may be mid-scroll), never
 * calls TourneyMachine, stops while the tab is hidden, and does nothing once every game is final (`complete`).
 *
 * The line sits in a polite live region, so the news is announced once. Without JS there is nothing: the
 * freshness stamp beside it says how old the scores are.
 */
const EVERY_MS = 3 * 60_000;

export function FestivalFreshness({ complete }: { complete: boolean }) {
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (complete || typeof fetch !== 'function') return;
    let first: string | null | undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const check = async () => {
      try {
        const res = await fetch(window.location.pathname, { method: 'HEAD', cache: 'no-store' });
        if (!res.ok || stopped) return;
        const tag = res.headers.get('etag') ?? res.headers.get('last-modified');
        if (first === undefined) first = tag;
        else if (tag && first && tag !== first) {
          setChanged(true);
          stopped = true;
          stop();
        }
      } catch {
        /* offline at the fields: try again next time */
      }
    };
    const start = () => {
      if (timer === null) timer = setInterval(check, EVERY_MS);
    };
    const onVisibility = () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        void check();
        start();
      } else stop();
    };
    void check();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [complete]);

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
