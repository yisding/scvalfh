'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * The route-level error boundary. Next 16 passes `retry`, not `reset`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 *
 * The page is static and cron-fed, so the only realistic cause is a bad snapshot or a bad URL —
 * which is what the copy says, rather than a generic apology.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // No analytics and no third-party reporting on this site (see /about#a11y).
    console.error(error);
  }, [error]);

  return (
    <div className="py-6">
      <p className="m-0 font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
        Something broke
      </p>
      <h1 className="mt-2 text-h1">This page could not be built from the current snapshot.</h1>
      <p className="mt-2 max-w-[62ch] text-body text-ink-2">
        Nothing you did caused this. The data behind the site is rebuilt nightly; if a rebuild
        shipped a bad snapshot, this page fails while the rest of the site keeps working.
      </p>
      {error.digest ? (
        <p className="mt-2 text-meta text-ink-3">
          Reference <span className="sx-num">{error.digest}</span>
        </p>
      ) : null}
      <p className="mt-4 flex flex-wrap gap-3 text-body">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center rounded-chip border border-hairline bg-surface px-3 text-meta font-semibold text-ink sx-tap"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-chip px-3 text-meta text-accent hover:underline"
        >
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
