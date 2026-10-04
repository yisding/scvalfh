'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';

import { useEffectiveLeague } from '../ui/use-league';
import type { LeagueId, TeamSlug } from '../../lib/types';

/**
 * The only reason any navigation on this site is a client component: `aria-current` and the
 * active ink need the current path (DESIGN §1.3, §3.1), the league-aware target needs the
 * remembered league, and the pending wash needs the link's own navigation status. ONE module
 * serves both the desktop TopNav and the phone BottomTabBar, rather than one per bar (see
 * components/ui/PinControl.tsx for the app's full client-module list).
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
 * The price of that is a gap between the tap and the new page (the route payload is fetched on
 * click), and on a slow phone network that gap read as "the tap did not register". So the tapped
 * item answers at once, in two steps: `:active` greys it under the finger (120ms, --sx-dur-tap),
 * and `useLinkStatus()` lights its capsule with the active wash, marked `data-pending`, until the
 * route commits. `aria-current` does NOT move early — it describes where the reader IS, and that
 * only changes when the history entry does. A globals.css rule keyed on `nav:has([data-pending])`
 * clears the old item's capsule meanwhile, so one item is lit at a time.
 *
 * `useLinkStatus()` only works in a DESCENDANT of the `<Link>` (node_modules/next/dist/docs/
 * 01-app/03-api-reference/04-functions/use-link-status.md), which is why each variant's contents
 * are their own inner component. They return the capsule span as a DIRECT child of the `<a>`, which
 * `.sx-navtop:focus-visible > .sx-indicator` (globals.css) depends on.
 *
 * League-aware targets (SPEC §8.3). Scores, Teams and Playoffs carry `leagueHrefs` (built by the
 * server bars from the league config) and every link gets `slugLeague` (the same `{slug: league}`
 * map the prefs script embeds). After hydration the link points at `leagueHrefs[L] ?? href`, where L
 * is the PAGE's league when the path names one (`/standings|schedule|playoffs/<id>`, or
 * `/teams/<slug>` through `slugLeague`), else the effective (remembered) league, else none. The
 * server HTML is always the index `href`, so there is no hydration mismatch and the nav works
 * with JS off; storage is never written here. The ACTIVE state is computed from the path part of
 * the base `href` (and of the league targets), so `/standings/bval` lights Teams (DESIGN §18),
 * `/playoffs/mcal` lights Playoffs, and a `#hash` target (`/playoffs#bval`, `/teams#bval`,
 * `/schedule#<date>`) never breaks `aria-current`.
 */
export interface NavLinkProps {
  /**
   * The destination. It may carry a `#fragment` (the Scores tab lands on a date on /schedule);
   * only the path part is compared with the current route.
   */
  href: string;
  /** 'tab' is the bottom-bar item (56px tall, an equal fifth of the bar); 'top' is the desktop nav link. */
  variant: 'tab' | 'top';
  label: string;
  /** Visually hidden words after the label (History: ' (2025-26 final standings)'). */
  srSuffix?: string;
  /** A 20px inline SVG glyph for the tab variant. */
  glyph?: React.ReactNode;
  /** The link target per league, e.g. { bval: '/standings/bval', … }. Serializable. */
  leagueHrefs?: Readonly<Partial<Record<LeagueId, string>>>;
  /** `{ slug: league }` for every team, so `/teams/<slug>` has a page league. */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

/**
 * Routes that belong to a section without living under its path. A day page and a game page are
 * both reached from /schedule and are what its Scores tab is FOR, so the reader on
 * /scores/2026-09-19 or /game/… keeps that section lit instead of a bar with nothing lit at all.
 * The standings pages belong to Teams, which absorbed the old Table tab (DESIGN §18): /standings
 * and /standings/<id> keep Teams lit.
 */
const SECTION_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  '/schedule': ['/scores/', '/game/'],
  '/teams': ['/standings'],
};

/**
 * `'page'` on the section's own page, `'true'` anywhere inside the section (a team page under
 * /teams, a day or game page under /schedule), otherwise null. Both draw the capsule; the ARIA
 * value tells a screen reader which of the two it is ("current page" against "current item"), and
 * forced colours outline either (globals.css matches any `aria-current` but "false").
 *
 * A league page the link itself can point at (`/standings/bval` for Table, `/playoffs/mcal` for
 * Playoffs) is `'page'`, not `'true'`: after hydration it IS the link's target.
 */
export type ActiveState = 'page' | 'true' | null;

const pathOf = (href: string) => href.split('#')[0];

function activeState(
  pathname: string,
  href: string,
  leagueHrefs?: Readonly<Partial<Record<string, string>>>,
): ActiveState {
  const path = pathOf(href);
  if (pathname === path) return 'page';
  if (Object.values(leagueHrefs ?? {}).some((h) => h !== undefined && pathOf(h) === pathname)) {
    return 'page';
  }
  // Home is exact-match only: every path starts with "/".
  if (path === '/') return null;
  if (pathname.startsWith(`${path}/`)) return 'true';
  if (SECTION_PREFIXES[path]?.some((prefix) => pathname.startsWith(prefix))) return 'true';
  return null;
}

/** Prefix matching on the BASE href: '/standings' is active on '/standings' and '/standings/bval'. */
export function isActive(
  pathname: string,
  href: string,
  leagueHrefs?: Readonly<Partial<Record<string, string>>>,
): boolean {
  return activeState(pathname, href, leagueHrefs) !== null;
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

/** The top-nav capsule. `lit` is the active OR pending look. */
function TopFace({
  label,
  suffix,
  active,
}: {
  label: string;
  suffix?: React.ReactNode;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  // The 44px link box is the target; the 36px capsule inside it is the visible state. The lit
  // capsule is accent-wash with accent-ink (6.5 / 7.55), never accent on the wash. The press grey
  // sits on the capsule rather than the link box, so it is the same shape as the wash that
  // follows it. 10px of side padding below 1024px, 12px from there (components/layout/
  // SiteHeader.tsx has the measurements for the seven links).
  return (
    <span
      data-pending={pending && !active ? '' : undefined}
      className={`sx-indicator inline-flex h-9 items-center rounded-full px-2.5 text-meta transition-colors duration-[var(--sx-dur-tap)] lg:px-3 ${
        lit
          ? 'bg-accent-wash font-semibold text-accent-ink'
          : 'font-medium group-hover:bg-surface-2 group-hover:text-ink group-active:bg-surface-2'
      }`}
    >
      {label}
      {suffix}
    </span>
  );
}

/** The tab's glyph capsule and label. */
function TabFace({
  label,
  suffix,
  glyph,
  active,
}: {
  label: string;
  suffix?: React.ReactNode;
  glyph: React.ReactNode;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const lit = active || pending;
  // The ink lives on the two spans, not on the link, so the globals.css pending rule's
  // `color: inherit` returns the old tab's glyph to the link's ink-2. The old tab's LABEL is
  // returned here, by the `nav:has([data-pending])` variant, which only the active label carries.
  return (
    <>
      <span
        aria-hidden="true"
        data-pending={pending && !active ? '' : undefined}
        className={[
          'sx-indicator flex h-7 w-14 max-w-full items-center justify-center rounded-full',
          lit ? 'bg-accent-wash text-accent-ink' : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {glyph}
      </span>
      <span
        className={`text-micro leading-none ${
          active
            ? 'font-semibold text-accent-ink [nav:has([data-pending])_&]:font-medium [nav:has([data-pending])_&]:text-ink-2'
            : pending
              ? 'font-semibold text-accent-ink'
              : 'font-medium'
        }`}
      >
        {label}
        {suffix}
      </span>
    </>
  );
}

export function NavLink({ href, variant, label, srSuffix, glyph, leagueHrefs, slugLeague }: NavLinkProps) {
  const pathname = usePathname();
  const { league, ready } = useEffectiveLeague();
  const state = activeState(pathname ?? '/', href, leagueHrefs);
  // Before hydration (and in the static HTML) the target is the index href.
  const target = ready ? navTarget({ href, leagueHrefs, slugLeague, pathname, effectiveLeague: league }) : href;
  const suffix = srSuffix ? <span className="sr-only">{srSuffix}</span> : null;

  if (variant === 'top') {
    // `.sx-navtop` moves the focus ring from the link box onto the capsule (globals.css). The
    // link's own ink-2 is what an unlit capsule, and a capsule cleared while another is pending,
    // inherits.
    return (
      <Link
        href={target}
        prefetch={false}
        aria-current={state ?? undefined}
        className="sx-navtop group inline-flex h-11 items-center text-ink-2 no-underline"
      >
        <TopFace label={label} suffix={suffix} active={state !== null} />
      </Link>
    );
  }

  // The active tab's non-colour cues are `aria-current`, the capsule behind the glyph and the
  // heavier label; forced colours draw an outline on `.sx-indicator` (globals.css). The focus ring
  // is drawn 4px INSIDE the 56px cell with the card radius: outside it, the bar's edge and the
  // screen's clipped the Home and Playoffs rings.
  return (
    <Link
      href={target}
      prefetch={false}
      aria-current={state ?? undefined}
      className="flex h-14 w-full flex-col items-center justify-center gap-1 text-ink-2 no-underline transition-colors duration-[var(--sx-dur-tap)] active:bg-surface-2 focus-visible:-outline-offset-4 focus-visible:rounded-card"
    >
      <TabFace label={label} suffix={suffix} glyph={glyph} active={state !== null} />
    </Link>
  );
}

export default NavLink;
