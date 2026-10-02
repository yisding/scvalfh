/**
 * The division switcher (DESIGN §1.2, §7.16; brief §4.21): plain in-page anchors drawn as pills.
 *
 * They are `<a href="#de-anza">`, NOT ARIA tabs and NOT a client component:
 *  - both divisions stay in the page, so neither is hidden from Cmd-F, from a screen reader, or
 *    from a reader who wants to compare them;
 *  - the links work with JavaScript off and they are shareable;
 *  - there is no scroll-spy, so there is no keyboard trap to get wrong and no `aria-current` that
 *    a static page could only ever guess at — hence NO active state on either pill.
 *
 * Two variants, and only one is ever displayed:
 *  - `bar` (phone): a 48px band that sticks directly under the 48px top bar, so the table head
 *    parks under both (the page sets `--sx-sticky-top: 6rem`). Hidden from 768px. `sx-chrome-top`
 *    gives it the same 1px CanvasText edge as the top bar under forced colours, where the
 *    box-shadow edge is dropped.
 *  - `inline` (≥768px): static, right-aligned in the page title row via PageHeader's `aside`.
 *
 * Each pill is a 36px capsule inside a 44px anchor, so the target is the full 44px (DESIGN §10.9).
 * The capsule is drawn like the page's other link pills — the surface with a 1px ring — because
 * surface-2 on the bg was nearly invisible in light, so the two read as words, not buttons. It
 * borrows TopNav's focus treatment: the anchor is `sx-navtop`, so the keyboard ring is drawn on
 * the `sx-indicator` capsule (2px out, following its 999px radius) instead of as a rectangle
 * around the 44px box. The 4px between capsule and anchor edge on each side is what keeps that
 * ring inside the 48px sticky bar rather than clipped by it. `group-active` is the press state,
 * for the anchor's whole 44px box. Neither pill is ever "current" (see above), so the
 * indicator's `aria-current` styling never applies.
 * The as-of stamp no longer rides here: the top bar and the footer already carry it.
 */
export interface DivisionTabsProps {
  tabs: Array<{ href: string; label: string }>;
  variant?: 'bar' | 'inline';
  /** Names the nav landmark for a screen reader. */
  label?: string;
  className?: string;
}

const VARIANT = {
  bar: 'sx-chrome-top sticky top-topbar z-10 -mx-gutter flex h-divbar items-center gap-2 bg-bg px-gutter shadow-[0_1px_0_var(--sx-border)] md:hidden',
  inline: 'hidden md:flex items-center gap-2',
} as const;

export function DivisionTabs({
  tabs,
  variant = 'bar',
  label = 'Divisions',
  className,
}: DivisionTabsProps) {
  return (
    <nav aria-label={label} className={`${VARIANT[variant]}${className ? ` ${className}` : ''}`}>
      {tabs.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className="group sx-navtop inline-flex h-11 shrink-0 items-center no-underline"
        >
          <span className="sx-indicator inline-flex h-9 items-center rounded-full bg-surface px-4 text-body font-medium text-ink shadow-[var(--sx-ring)] hover:bg-surface-2 group-active:bg-surface-3 forced-colors:border">
            {tab.label}
          </span>
        </a>
      ))}
    </nav>
  );
}

export default DivisionTabs;
