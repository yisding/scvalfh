import NavLink from './NavLink';

/**
 * The phone bottom bar (DESIGN §1.3, §3.1, R-3). FIVE tabs, because "find my school" was a
 * top-three task with no phone nav entry. The bar is 56px tall plus the safe-area inset; each tab
 * is an equal fifth of a row capped at 448px, so a 320px phone still gets 64×56 per tab (past the
 * 44×44 minimum) and the fifth tab is never pushed off-screen. The labels are ≤6 characters at
 * 12px, so they do not truncate at any supported width.
 *
 * It is a `<nav aria-label="Sections">` and the active tab carries `aria-current="page"`, accent
 * ink, a wash capsule behind its glyph AND a heavier label — never color alone.
 */
const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TABS = [
  {
    href: '/',
    label: 'Home',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M3 8.5 10 3l7 5.5" />
        <path d="M5 8v9h10V8" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    label: 'Scores',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="1.5" />
        <path d="M3 8h14M7 4V2.5M13 4V2.5" />
      </svg>
    ),
  },
  {
    href: '/standings',
    label: 'Table',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    ),
  },
  {
    href: '/teams',
    label: 'Teams',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: '/playoffs',
    label: 'CCS',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M4 4v8a6 6 0 0 0 12 0V4z" />
        <path d="M8 18h4" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  return (
    <nav
      aria-label="Sections"
      className="sx-chrome-bottom fixed bottom-0 left-0 z-20 w-full bg-surface shadow-[0_-1px_0_var(--sx-border)] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-md list-none p-0">
        {TABS.map((tab) => (
          <li key={tab.href} className="min-w-0 flex-1">
            <NavLink href={tab.href} variant="tab" label={tab.label} glyph={tab.glyph} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomTabBar;
