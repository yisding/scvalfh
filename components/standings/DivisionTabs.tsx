/**
 * The division switcher (DESIGN §33): plain in-page anchors drawn as `.sx-tabs`, the one selector face.
 *
 * They are `<a href="#de-anza">`, NOT ARIA tabs and NOT a client component: both divisions stay in the
 * page (Cmd-F, a screen reader, a reader comparing them), the links work with JavaScript off, and
 * there is no scroll-spy, so no tab is ever "current" and none carries `aria-current` (a caller that
 * knows the current one, a month or a date strip, passes `current`).
 *
 * Two variants, and only one is ever displayed:
 *  - `bar` (phone): sticks directly under the 48px top bar on the page's own paper (`bg-bg`), so the
 *    table head parks under both (the page sets `--sx-sticky-top: 6rem`). Hidden from 768px.
 *    `sx-chrome-top` gives it a CanvasText edge under forced colours. It scrolls sideways on its own
 *    (no scrollbar drawn) instead of widening the page.
 *  - `inline` (≥768px): static, in the page header.
 */
export interface DivisionTabsProps {
  /**
   * `region` (optional) puts `data-region-scope` on the pill, so the scope stylesheet shows only the
   * reader's region's pills (/leaders and /history, whose SoCal anchors carry the `-socal` suffix:
   * DESIGN-socal §2.4). Pills with no region always show.
   *
   * `srSuffix` (optional) follows the visible label in an sr-only span (', Southern California'), so
   * two pills with the same visible text and different targets have different accessible names when
   * JS is off and both regions' pills show (WCAG 2.4.9; the visible text comes first, 2.5.3).
   */
  tabs: Array<{ href: string; label: string; region?: 'norcal' | 'socal'; srSuffix?: string; current?: boolean }>;
  variant?: 'bar' | 'inline';
  /** Names the nav landmark for a screen reader. */
  label?: string;
  className?: string;
}

const VARIANT = {
  // 48px (`h-divbar`): the sticky stack maths (`--sx-sticky-top: 6rem`, scroll-padding) count on it.
  bar: 'sx-chrome-top sticky top-topbar z-10 -mx-gutter h-divbar bg-bg px-gutter md:hidden',
  inline: 'hidden md:block',
} as const;

export function DivisionTabs({
  tabs,
  variant = 'bar',
  label = 'Divisions',
  className,
}: DivisionTabsProps) {
  return (
    // Screen-only (`sx-print-hide`): a jump nav is no use on paper.
    <nav aria-label={label} className={['sx-print-hide', VARIANT[variant], className].filter(Boolean).join(' ')}>
      <ul className="sx-tabs h-full">
        {tabs.map((tab) => (
          // The region scope stays on the anchor (tests/ui/history-view.test.ts); a hidden anchor leaves
          // an empty, zero-width item.
          <li key={tab.href}>
            <a href={tab.href} data-region-scope={tab.region} aria-current={tab.current ? 'true' : undefined} className="sx-tab">
              {tab.label}
              {tab.srSuffix ? <span className="sr-only">{tab.srSuffix}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default DivisionTabs;
