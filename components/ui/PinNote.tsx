import Link from 'next/link';

/**
 * The pinned team's words in a team list.
 *
 * The pin lives in localStorage and the pages are static, so the server cannot know which row is
 * the reader's team. Every row instead carries `data-team-slug` and this hidden note; the
 * pinned-team head script (components/prefs/pinned-team-script.ts, run from app/layout.tsx's
 * `<head>`; then components/prefs/PinnedTeamMarks.tsx after a client navigation) sets
 * `[data-pinned]` on the matching row, and app/globals.css displays the note inside that row
 * only. The accent rule beside a pinned row is then never the only thing saying "this is your
 * team" (WCAG 1.3.1): the note leads the row link's accessible name, before the school.
 *
 * It sits inside an `sr-only` span, so it is heard, never seen.
 */
export function PinNote({ text = 'Your team. ' }: { text?: string }) {
  return (
    <span className="sx-pin-note" hidden>
      {text}
    </span>
  );
}

/**
 * The stretched row link of a team table: its hit area is exactly the row (the `<tr>` is
 * `position: relative`) and never overlaps a neighbour. Its accessible name is the pin note, then
 * the row's own sentence.
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx) and the team
 * tiles: every team route is STATIC, and Next 16's default `auto` downloads a static route in full
 * the moment the link enters the viewport. SCVAL's fifteen rows in one viewport are fifteen whole
 * team pages — measured at 97 KB on the wire and 876 KB decoded, against a 35 KB document.
 * Navigation still fetches on click.
 */
export function StretchedRowLink({
  href,
  label,
  className = 'absolute inset-0',
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link href={href} prefetch={false} className={className}>
      <span className="sr-only">
        <PinNote />
        {label}
      </span>
    </Link>
  );
}

/**
 * A table row's team link (DESIGN §33): the visible name IS the link (`.sx-rowlink`: ink, underlined
 * on hover and focus), and its `::after` stretches over the positioned row, so the whole row is the
 * target and the keyboard ring is drawn around the row. The accessible name is `label`, the row's
 * sentence, led by the pin note; the visible name is aria-hidden so it is not read twice.
 */
export function TeamRowLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="sx-rowlink min-w-0">
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">
        <PinNote />
        {label}
      </span>
    </Link>
  );
}
