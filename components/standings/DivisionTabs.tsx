/**
 * The division switcher (DESIGN §1.2, §7.16): plain in-page anchors, 44px tall, sticky directly
 * under the top bar.
 *
 * They are `<a href="#de-anza">`, NOT ARIA tabs and NOT a client component:
 *  - both divisions stay in the page, so neither is hidden from Cmd-F, from a screen reader, or
 *    from a reader who wants to compare them;
 *  - the links work with JavaScript off and they are shareable;
 *  - there is no scroll-spy, so there is no keyboard trap to get wrong and no `aria-current` that
 *    a static page could only ever guess at.
 *
 * The freshness stamp rides on the right of the same bar rather than taking a row of its own —
 * the same 28px-of-fold trade the top bar makes in DESIGN §1.3 (R-5). That matters here because
 * the phone fold budget for this page is 44 (top bar) + 44 (this bar) + 28 (kicker) + 30 (table
 * head), which is what puts rows 1-7 of 8 above the fold.
 *
 * The tabs never shrink — a truncated "El Camin" is not a division — so the STAMP is what gives
 * way. Below 380px the two labels and the stamp do not both fit and they were being painted on
 * top of each other, leaving both illegible; there the stamp steps out, and the same instant is
 * still published verbatim in the Attribution footer on every page.
 */
export interface DivisionTabsProps {
  tabs: Array<{ href: string; label: string }>;
  /** The "as of" stamp, right-aligned in the bar. */
  stamp?: React.ReactNode;
  /** Names the bar for a screen reader. */
  label?: string;
}

export function DivisionTabs({ tabs, stamp, label = 'Divisions' }: DivisionTabsProps) {
  return (
    <div className="sx-bleed sticky top-topbar z-10 border-b border-hairline bg-surface md:top-topbar-lg md:rounded-none">
      <div className="mx-auto flex h-11 max-w-content items-center gap-1 px-gutter md:px-gutter-lg">
        <nav aria-label={label} className="flex min-w-0 items-center gap-1">
          {tabs.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className="sx-tap inline-flex h-11 shrink-0 items-center rounded-tag px-2 text-body font-semibold text-ink no-underline"
            >
              {tab.label}
            </a>
          ))}
        </nav>
        {stamp ? (
          <span className="ml-auto hidden shrink-0 pl-2 min-[380px]:block">{stamp}</span>
        ) : null}
      </div>
    </div>
  );
}

export default DivisionTabs;
