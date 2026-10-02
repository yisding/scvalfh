'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useEffectiveLeague } from '../ui/use-league';
import type { LeagueId, TeamSlug } from '../../lib/types';

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
 *
 * League-aware targets (SPEC §8.3). Scores, Table and Playoffs carry `leagueHrefs` (built by the
 * server bars from the league config) and every link gets `slugLeague` (the same `{slug: league}`
 * map the prefs script embeds). After hydration the link points at `leagueHrefs[L] ?? href`, where L
 * is the PAGE's league when the path names one (`/standings|schedule|playoffs/<id>`, or
 * `/teams/<slug>` through `slugLeague`), else the effective (remembered) league, else none. The
 * server HTML is always the index `href`, so there is no hydration mismatch and the nav works
 * with JS off; storage is never written here. The ACTIVE state is computed from the base `href`
 * only, so `/standings/bval` lights Table, `/playoffs/mcal` lights Playoffs, and a `#hash` target
 * (`/playoffs#bval`) never breaks `aria-current`.
 */
export interface NavLinkProps {
  href: string;
  /** 'tab' is the bottom-bar item (56px tall, an equal fifth of the bar); 'top' is the desktop nav link. */
  variant: 'tab' | 'top';
  label: string;
  /** Visually hidden words after the label (History: ' (SCVAL 2025-26)'). */
  srSuffix?: string;
  /** A 20px inline SVG glyph for the tab variant. */
  glyph?: React.ReactNode;
  /** The link target per league, e.g. { bval: '/standings/bval', … }. Serializable. */
  leagueHrefs?: Readonly<Partial<Record<LeagueId, string>>>;
  /** `{ slug: league }` for every team, so `/teams/<slug>` has a page league. */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/** Prefix matching on the BASE href: '/standings' is active on '/standings' and '/standings/bval'. */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The league a path is ABOUT, if any: `/standings/<id>`, `/schedule/<id>`, `/playoffs/<id>` for a
 * known league id, or `/teams/<slug>` for a known slug. `known` is the set of league ids.
 */
export function pageLeagueOf(
  pathname: string | null | undefined,
  known: ReadonlySet<string>,
  slugLeague?: Readonly<Record<string, string>>,
): string | null {
  if (!pathname) return null;
  const m = /^\/(standings|schedule|playoffs|teams)\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return null;
  const [, family, param] = m;
  if (family === 'teams') {
    return slugLeague && hasOwn(slugLeague, param) ? slugLeague[param] : null;
  }
  return known.has(param) ? param : null;
}

/** The link target: `leagueHrefs[L] ?? href` with L = page league, else the effective league. */
export function navTarget(args: {
  href: string;
  leagueHrefs?: Readonly<Partial<Record<string, string>>>;
  slugLeague?: Readonly<Record<string, string>>;
  pathname: string | null | undefined;
  effectiveLeague: string | null;
}): string {
  const { href, leagueHrefs, slugLeague, pathname, effectiveLeague } = args;
  if (!leagueHrefs) return href;
  const known = new Set<string>([...Object.keys(leagueHrefs), ...Object.values(slugLeague ?? {})]);
  const league = pageLeagueOf(pathname, known, slugLeague) ?? effectiveLeague;
  return (league !== null && hasOwn(leagueHrefs, league) ? leagueHrefs[league] : undefined) ?? href;
}

export function NavLink({ href, variant, label, srSuffix, glyph, leagueHrefs, slugLeague }: NavLinkProps) {
  const pathname = usePathname();
  const { league, ready } = useEffectiveLeague();
  const active = isActive(pathname ?? '/', href);
  // Before hydration (and in the static HTML) the target is the index href.
  const target = ready ? navTarget({ href, leagueHrefs, slugLeague, pathname, effectiveLeague: league }) : href;
  const suffix = srSuffix ? <span className="sr-only">{srSuffix}</span> : null;

  if (variant === 'top') {
    // The 44px link box is the target; the 36px capsule inside it is the visible state. The
    // active capsule is accent-wash with accent-ink (6.5 / 7.55), never accent on the wash.
    // `.sx-navtop` moves the focus ring from the link box onto the capsule (globals.css).
    return (
      <Link
        href={target}
        prefetch={false}
        aria-current={active ? 'page' : undefined}
        className="sx-navtop group inline-flex h-11 items-center no-underline"
      >
        <span
          className={`sx-indicator inline-flex h-9 items-center rounded-full px-2.5 text-meta lg:px-3 ${
            active
              ? 'bg-accent-wash font-semibold text-accent-ink'
              : 'font-medium text-ink-2 group-hover:bg-surface-2 group-hover:text-ink'
          }`}
        >
          {label}
          {suffix}
        </span>
      </Link>
    );
  }

  // The active tab's non-colour cues are `aria-current`, the capsule behind the glyph and the
  // heavier label; forced colours draw an outline on `.sx-indicator` (globals.css).
  return (
    <Link
      href={target}
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
        {suffix}
      </span>
    </Link>
  );
}

export default NavLink;
