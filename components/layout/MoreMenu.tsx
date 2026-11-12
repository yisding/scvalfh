'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The phone tab bar's fifth cell (DESIGN §33): a native `<details>` whose summary is the "More" tab
 * and whose panel is a sheet above the bar with the sections the four tabs do not hold. With no
 * JavaScript it is a plain disclosure. With it, the sheet closes when the route changes, on Escape
 * (focus returns to the summary) and on a press outside it.
 *
 * It imports nothing but React and next: the links and the stamp arrive as props from the server
 * bar (tests/ui/client-boundary.test.ts).
 */
export interface MoreMenuLink {
  href: string;
  label: string;
  /** Opens in a new tab (the corrections thread). */
  external?: boolean;
}

export interface MoreMenuProps {
  links: readonly MoreMenuLink[];
  /** 'Updated Wed Nov 11, 1:03 PM PT.' — formatted on the server. */
  stamp?: string;
  glyph: React.ReactNode;
}

/** Routes the sheet's links lead to: on any of them the More tab is the lit one. */
const MORE_ROUTES = ['/teams', '/leaders', '/jv', '/history', '/about', '/clubs', '/commits', '/recruiting'];

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function MoreMenu({ links, stamp, glyph }: MoreMenuProps) {
  const pathname = usePathname() ?? '/';
  const details = useRef<HTMLDetailsElement>(null);
  const onMoreRoute = MORE_ROUTES.some((root) => under(pathname, root));

  // A tap on a sheet link navigates; the sheet must not stay open over the new page.
  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const onPointerDown = (event: PointerEvent) => {
      if (el.open && event.target instanceof Node && !el.contains(event.target)) el.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !el.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <details ref={details} className="sx-more">
      <summary className="sx-tabbar-tab" data-current={onMoreRoute ? '' : undefined}>
        <span aria-hidden="true" className="flex">
          {glyph}
        </span>
        <span className="text-[length:min(var(--text-kicker),12.5px)] leading-none">More</span>
      </summary>
      <div className="sx-more-sheet">
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              {link.external ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link
                  href={link.href}
                  prefetch={false}
                  aria-current={pathname === link.href ? 'page' : under(pathname, link.href) ? 'true' : undefined}
                >
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
        {stamp ? <p>{stamp}</p> : null}
      </div>
    </details>
  );
}

export default MoreMenu;
