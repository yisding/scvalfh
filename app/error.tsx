'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * The route-level error boundary. Next 16 passes `retry`, not `reset`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 *
 * The page is static and cron-fed, so the realistic cause is a bad snapshot, but the reader does
 * not need that mechanism: a title that says what happened and the way on ("Try again", "Scores").
 * The digest is kept as a small reference line so a correction request can quote it.
 *
 * A client module, so it cannot use PageHeader (which reads the snapshot for its stamp): it writes
 * the same `sx-pagehead` block by hand, without a freshness stamp.
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
    <div className="pb-section-lg">
      <header className="sx-pagehead">
        <h1 className="m-0 text-h1 text-ink">Something went wrong</h1>
      </header>
      <div className="mt-4">
        {error.digest ? (
          <p className="m-0 mb-4 text-meta text-ink-3">
            Reference <span className="sx-num">{error.digest}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="sx-btn sx-btn-primary">
            Try again
          </button>
          <Link href="/" prefetch={false} className="sx-btn">
            Scores
          </Link>
        </div>
      </div>
    </div>
  );
}
