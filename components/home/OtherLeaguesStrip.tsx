import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import SectionHeader from '@/components/ui/SectionHeader';
import type { OtherLeagueLine } from '@/views/home/home-view';

/**
 * The other three leagues in one line each (SPEC §10.1): who leads each division —
 * `SCVAL: St. Ignatius leads De Anza · Los Gatos leads El Camino`, `PCAL: Stevenson leads`,
 * co-leaders `A & B lead`, `No league results yet` before any result. Each line links that league's
 * standings. A reader who follows one league still sees the rest of the area at a glance, and the
 * line costs no hue (leagues get none, DESIGN §6.4).
 */
export interface OtherLeaguesStripProps {
  lines: OtherLeagueLine[];
  className?: string;
}

export function OtherLeaguesStrip({ lines, className }: OtherLeaguesStripProps) {
  if (lines.length === 0) return null;
  return (
    <section className={className}>
      <SectionHeader as="h3" kicker="Other leagues" />
      {/* The 46rem measure (as on the team page). Each row's arrow follows its text rather than
          sitting at the row's far edge, so a short row's arrow is never hundreds of px away. */}
      <ul className="m-0 max-w-[46rem] list-none p-0">
        {lines.map((line) => (
          <li key={line.id}>
            <Link
              href={line.href}
              prefetch={false}
              className="flex min-h-11 items-center gap-1 py-1 text-meta text-ink-2 no-underline hover:underline"
            >
              <span className="min-w-0">
                <span className="font-semibold text-ink">{line.shortName}:</span> {line.text}
              </span>
              <Arrow className="shrink-0 text-accent" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default OtherLeaguesStrip;
