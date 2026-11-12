import Link from 'next/link';

/**
 * The recruiting family's tab row (DESIGN §33), the one tab row of /commits, /clubs, /clubs/[slug] and
 * /recruiting: "Commitments", "Clubs", "By school". The current page's tab carries `aria-current`
 * ("page" on the three index pages; "true" on a club's own page, which sits under "Clubs").
 *
 * `prefetch={false}`: the links are written in a `.map()` and every target is a static route
 * (tests/ui/prefetch-policy.test.ts).
 */
const TABS = [
  { id: 'commits', href: '/commits', label: 'Commitments' },
  { id: 'clubs', href: '/clubs', label: 'Clubs' },
  { id: 'recruiting', href: '/recruiting', label: 'By school' },
] as const;

export interface RecruitingTabsProps {
  current: (typeof TABS)[number]['id'];
  /** false on a page under a tab (a club's own page): the tab is lit, and it is still a link back. */
  exact?: boolean;
}

export function RecruitingTabs({ current, exact = true }: RecruitingTabsProps) {
  return (
    <nav aria-label="Recruiting" className="sx-print-hide">
      <ul className="sx-tabs">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              prefetch={false}
              className="sx-tab"
              aria-current={tab.id === current ? (exact ? 'page' : 'true') : undefined}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default RecruitingTabs;
