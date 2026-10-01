import type { Metadata } from 'next';
import Link from 'next/link';

import SectionHeader from '@/components/ui/SectionHeader';

export const metadata: Metadata = {
  title: 'Page not found',
};

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, no dashed box, and the
 * links are the real navigation rather than a single "go home".
 */
export default function NotFound() {
  return (
    <div className="py-6">
      <SectionHeader kicker="404" />
      <h1 className="mt-2 text-h1">That page is not here.</h1>
      <p className="mt-2 max-w-[62ch] text-body text-ink-2">
        The link may be old, or the game or date may not exist in this season&rsquo;s data. Every
        page on this site is one of the links below.
      </p>
      <ul className="mt-4 list-none space-y-2 p-0 text-body">
        <li>
          <Link href="/" className="text-accent hover:underline">
            Home — what just happened, and when the next game is
          </Link>
        </li>
        <li>
          <Link href="/standings" className="text-accent hover:underline">
            Standings — both divisions
          </Link>
        </li>
        <li>
          <Link href="/schedule" className="text-accent hover:underline">
            Schedule &amp; results — the whole season
          </Link>
        </li>
        <li>
          <Link href="/teams" className="text-accent hover:underline">
            Teams — find your school
          </Link>
        </li>
        <li>
          <Link href="/playoffs" className="text-accent hover:underline">
            CCS playoffs
          </Link>
        </li>
        <li>
          <Link href="/about" className="text-accent hover:underline">
            About — where this data comes from
          </Link>
        </li>
      </ul>
    </div>
  );
}
