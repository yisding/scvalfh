'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { RegionSwitcher } from '../prefs/LeagueSwitcher';
import ThemeToggle from '../prefs/ThemeToggle';
import { useIsHydrated, useStoredValue } from '../prefs/local-store';
import { PINNED_TEAM_KEY } from '../prefs/pinned-team-script';

/**
 * The phone bar's fifth cell (DESIGN §33): a native `<details>` whose summary is the "More" tab and
 * whose panel is a sheet above the bar, over a scrim that covers the page and the header. The sheet
 * is ONE list: the reader's team (when one is pinned), the sections the four tabs do not hold, the
 * corrections thread, then the two preferences as rows ("Dark mode", "Switch to SoCal"). Under it,
 * the long Updated text.
 *
 * With no JavaScript it is a plain disclosure. With it, the sheet closes when the route changes, on
 * Escape (focus returns to the summary), on Close and on a press on the scrim or anywhere outside it.
 *
 * It imports nothing but React, next and the prefs controls: the links, the names and the stamp
 * arrive as props from the server bar (tests/ui/client-boundary.test.ts).
 */
export interface MoreMenuLink {
  href: string;
  label: string;
  /** Opens in a new tab (the corrections thread). */
  external?: boolean;
}

export interface MoreMenuProps {
  links: readonly MoreMenuLink[];
  /** 'Updated Wed Nov 11, 1:03 PM PT' — formatted on the server. */
  stamp?: string;
  /** `{ slug: short name }` for every team, to name the pinned one. */
  teamNames?: Readonly<Record<string, string>>;
  /** Where the logo files live ('/mascots/'): the pinned row's logo is `<mascotBase><slug>-24.webp`. */
  mascotBase?: string;
  /** @deprecated The More tab is the word alone; accepted and ignored. */
  glyph?: React.ReactNode;
}

/** Routes the sheet's links lead to: on any of them the More tab is the lit one. */
const MORE_ROUTES = ['/leaders', '/jv', '/history', '/about', '/clubs', '/commits', '/recruiting'];

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function MoreMenu({ links, stamp, teamNames, mascotBase = '/mascots/' }: MoreMenuProps) {
  const pathname = usePathname() ?? '/';
  const details = useRef<HTMLDetailsElement>(null);
  const onMoreRoute = MORE_ROUTES.some((root) => under(pathname, root));
  const hydrated = useIsHydrated();
  const stored = useStoredValue(PINNED_TEAM_KEY);
  // Only a slug the build knows: a stale pin names no team.
  const pinned = hydrated && stored && teamNames && hasOwn(teamNames, stored) ? stored : null;

  const close = (refocus = false) => {
    const el = details.current;
    if (!el || !el.open) return;
    el.open = false;
    if (refocus) el.querySelector('summary')?.focus();
  };

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
        More
      </summary>
      <div className="sx-more-scrim" onClick={() => close()} />
      <div className="sx-more-sheet">
        <div className="sx-more-head">
          <span>More</span>
          <button type="button" className="sx-btn sx-js-only" onClick={() => close(true)}>
            Close
          </button>
        </div>
        <ul>
          {/* The reader's team. Ships hidden; shown once the pin has been read from storage. */}
          <li hidden={!pinned}>
            {pinned ? (
              <Link href={`/teams/${pinned}`} prefetch={false} aria-current={pathname === `/teams/${pinned}` ? 'page' : undefined}>
                {/* A static, pre-sized square from public/. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="sx-monogram"
                  src={`${mascotBase}${pinned}-24.webp`}
                  srcSet={`${mascotBase}${pinned}-48.webp 2x`}
                  width={24}
                  height={24}
                  alt=""
                />
                {teamNames?.[pinned]}
                <span className="sx-pin-words">Your team</span>
              </Link>
            ) : null}
          </li>
          {links.map((link) => (
            <li key={link.href}>
              {link.external ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 1.5h5.5V7M8.5 1.5 1.5 8.5" />
                  </svg>
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
          <li data-prefs="">
            <ThemeToggle face="row" />
          </li>
          <li data-region-row="">
            <RegionSwitcher face="text" />
          </li>
        </ul>
        {stamp ? <p>{stamp}</p> : null}
      </div>
    </details>
  );
}

export default MoreMenu;
