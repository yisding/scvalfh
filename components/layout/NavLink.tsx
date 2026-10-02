'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The only reason any navigation on this site is a client component: `aria-current="page"` and the
 * active ink need the current path (DESIGN §1.3, §3.1). ONE module serves both the desktop TopNav
 * and the phone BottomTabBar, rather than one per bar (see components/ui/PinControl.tsx for the
 * app's full client-module list).
 *
 * `prefetch={false}` on every nav link, deliberately. Every route on this site is STATIC, and
 * Next 16's default `auto` prefetches a static route in full — data included — the moment the link
 * enters the viewport. The nav is in the viewport on every page, so the phone that opens the home
 * page and never navigates was pulling 21 route payloads (149 KB transferred, 2.1 MB decoded)
 * on top of a 21 KB document, /schedule's own being 1.28 MB. The framework answer is
 * `partialPrefetching`, which requires `cacheComponents`, which this project keeps off
 * (BUILD-BRIEF). Navigation still fetches on click; what is gone is the speculative download of
 * the whole site from every page.
 */
export interface NavLinkProps {
  href: string;
  /** 'tab' is the bottom-bar item (56px tall, an equal fifth of the bar); 'top' is the desktop nav link. */
  variant: 'tab' | 'top';
  label: string;
  /** A 20px inline SVG glyph for the tab variant. */
  glyph?: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, variant, label, glyph }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActive(pathname ?? '/', href);

  if (variant === 'top') {
    // The 44px link box is the target; the 36px capsule inside it is the visible state. The
    // active capsule is accent-wash with accent-ink (6.5 / 7.55), never accent on the wash.
    return (
      <Link
        href={href}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        className="group inline-flex h-11 items-center no-underline"
      >
        <span
          className={`sx-indicator inline-flex h-9 items-center rounded-full px-2.5 text-meta lg:px-3 ${
            active
              ? 'bg-accent-wash font-semibold text-accent-ink'
              : 'font-medium text-ink-2 group-hover:bg-surface-2 group-hover:text-ink'
          }`}
        >
          {label}
        </span>
      </Link>
    );
  }

  // The active tab's non-colour cues are `aria-current`, the capsule behind the glyph and the
  // heavier label; forced colours draw an outline on `.sx-indicator` (globals.css).
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={`flex h-14 w-full flex-col items-center justify-center gap-1 no-underline ${
        active ? 'text-accent-ink' : 'text-ink-2'
      }`}
    >
      <span
        aria-hidden="true"
        className={`sx-indicator flex h-7 w-14 max-w-full items-center justify-center rounded-full${
          active ? ' bg-accent-wash' : ''
        }`}
      >
        {glyph}
      </span>
      <span className={`text-micro leading-none ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    </Link>
  );
}

export default NavLink;
