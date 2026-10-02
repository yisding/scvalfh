'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';

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
    <div className="pb-section-lg">
      <PageHeader
        eyebrow="Something broke"
        title="This page could not be built from the current snapshot."
        description="Nothing you did caused this. The data behind the site is rebuilt nightly; if a rebuild shipped a bad snapshot, this page fails while the rest of the site keeps working."
      />
      <div className="mt-8 md:mt-10">
        {error.digest ? (
          <p className="m-0 mb-4 text-meta text-ink-3">
            Reference <span className="sx-num">{error.digest}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => retry()} className="sx-pill sx-pill-accent min-h-11">
            Try again
          </button>
          <Link href="/" className="sx-pill min-h-11">
            Go to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}
