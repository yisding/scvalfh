import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/ui/EmptyState';

export const metadata: Metadata = {
  title: 'Page not found',
};

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Home — what just happened, and when the next game is' },
  { href: '/standings', label: 'Standings — both divisions' },
  { href: '/schedule', label: 'Schedule & results — the whole season' },
  { href: '/teams', label: 'Teams — find your school' },
  { href: '/playoffs', label: 'CCS playoffs' },
  { href: '/about', label: 'About — where this data comes from' },
];

/**
 * Say what is true, say what to do next (DESIGN §8). No illustration, no dashed box, and the
 * links are the real navigation rather than a single "go home".
 */
export default function NotFound() {
  return (
    <div>
      <PageHeader eyebrow="404" title="That page is not here." />
      <div className="mt-8 md:mt-10">
        <EmptyState heading="Nothing lives at this address.">
          The link may be old, or the game or date may not exist in this season&rsquo;s data. Every
          page on this site is one of the links below.
        </EmptyState>
        <ul className="mt-stack flex list-none flex-wrap gap-2 p-0">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} prefetch={false} className="sx-pill min-h-11 py-2">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
