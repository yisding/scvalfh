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
    return (
      <Link
        href={href}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex h-11 items-center px-2 text-meta no-underline ${
          active ? 'font-semibold text-accent-ink' : 'text-ink-2 hover:text-ink'
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 no-underline ${
        active ? 'text-accent-ink' : 'text-ink-2'
      }`}
      style={{
        // A 2px top rule is the second, non-color cue for the active tab.
        boxShadow: active ? 'inset 0 2px 0 var(--sx-accent)' : undefined,
      }}
    >
      <span aria-hidden="true" className="flex h-5 items-center">
        {glyph}
      </span>
      <span className="text-[0.625rem] font-semibold leading-none">{label}</span>
    </Link>
  );
}

export default NavLink;
