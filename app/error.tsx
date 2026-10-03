'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';

/**
 * The route-level error boundary. Next 16 passes `retry`, not `reset`
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 *
 * The page is static and cron-fed, so the realistic cause is a bad snapshot — but the reader
 * does not need that mechanism. The copy says three plain things: it is our fault, not theirs;
 * the rest of the site should still work; and what to do now (the two buttons). The digest is
 * kept as a small reference line so a correction request can quote it.
 *
 * "Go to the home page" sits on the canvas, where the default `sx-pill` fill (surface-2) read as
 * a grey label rather than a control; `bg-surface` plus the hairline ring makes it a button,
 * the same canvas-pill treatment the other "See all"/stepper pills use.
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
        eyebrow="Something went wrong"
        title="This page didn’t load."
        description="It’s a problem on our end, not yours. The rest of the site should still work. Try again, or go back to the home page."
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
          <Link
            href="/"
            className="sx-pill min-h-11 bg-surface shadow-[var(--sx-ring)] hover:bg-surface-2"
          >
            Go to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}
