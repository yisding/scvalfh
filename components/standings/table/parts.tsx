import Link from 'next/link';
import type { ReactNode } from 'react';

import TeamMonogram from '@/components/ui/TeamMonogram';
import type { MascotTileSize } from '@/lib/config/mascots';

/**
 * The row parts every team table on the site shares: the standings tables (StandingsTable's phone
 * and desktop variants), the home page's mini table, the compact overview and JV tables, the
 * tournament seeds, the playoff projection, the leader boards and the history archive tables.
 * Each caller passes its own class strings; the markup, and the reasons for it, live here once.
 */

/**
 * The pinned team's hidden note. Only the pinned row's copy is displayed (app/globals.css: the
 * row's `data-team-slug` gets `data-pinned`), so the accent rule is never the only thing saying
 * "this is your team". It goes first in the row link's accessible name, before the school.
 */
export function PinNote({ children = 'Your team. ' }: { children?: ReactNode }) {
  return (
    <span className="sx-pin-note" hidden>
      {children}
    </span>
  );
}

/**
 * The stretched row link: its hit area is exactly the row (the `<tr>` is `relative`) and never
 * overlaps a neighbour. Its accessible name is the pin note and `label`, the row in one sentence.
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx) and the team
 * tiles: every team route is STATIC, and Next 16's default `auto` downloads a static route in full
 * the moment the link enters the viewport. SCVAL's fifteen rows in one viewport are fifteen whole
 * team pages — measured at 97 KB on the wire and 876 KB decoded, against a 35 KB document.
 * Navigation still fetches on click.
 */
export function TeamRowLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={className ? `absolute inset-0 ${className}` : 'absolute inset-0'}>
      <span className="sr-only">
        <PinNote />
        {label}
      </span>
    </Link>
  );
}

/**
 * A team's monogram and its name, side by side in the caller's flex row (or link). `children`
 * replaces the plain short name: a two-line name block, or the archive's full school name.
 */
export function TeamNameCell({
  team,
  size = 24,
  nameClass,
  monogramClass,
  children,
}: {
  team: { slug: string; name: string; shortName: string };
  size?: MascotTileSize;
  nameClass: string;
  monogramClass?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <TeamMonogram team={team} size={size} className={monogramClass} />
      <span className={nameClass}>{children ?? team.shortName}</span>
    </>
  );
}

/**
 * The ladder line (SPEC §10.3): a labelled separator row, so the 2px rule is never the only cue
 * (WCAG 1.3.1). Not a data row: its one cell spans the table. `hideWhileSearching` carries the
 * hook the /teams finder's filter mode hides it by (CompactStandingsTable `filterable`).
 */
export function LadderLineRow({
  colSpan,
  label,
  className = 'border-t-2 border-rule py-1 pl-gutter text-micro text-ink-3',
  hideWhileSearching = false,
}: {
  colSpan: number;
  label: ReactNode;
  className?: string;
  hideWhileSearching?: boolean;
}) {
  return (
    <tr data-hide-while-searching={hideWhileSearching ? '' : undefined}>
      <td colSpan={colSpan} className={className}>
        {label}
      </td>
    </tr>
  );
}
