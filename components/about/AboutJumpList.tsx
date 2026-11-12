import type { JumpListItem } from './about-view';

/**
 * The /about section index (DESIGN §33): ONE list in the DOM. From 1024 it is the page's rail, a
 * sticky column of links beside the sections; below that it is a wrapping row of links between the
 * summary and the first section (`.sx-linkrow`). Each league's rules entry carries its league's
 * region (`data-region-scope`), so the reader's region's entries show; those entries are sub-items
 * of "Standings" and appear in the rail only, so the phone's row stays a dozen links.
 */
export function AboutJumpList({ items, className }: { items: readonly JumpListItem[]; className?: string }) {
  return (
    <nav
      aria-label="On this page"
      className={['sx-print-hide lg:sticky lg:top-[calc(var(--sx-sticky-top,4rem)+1rem)] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto', className].filter(Boolean).join(' ')}
    >
      <ul className="sx-linkrow lg:mt-0 lg:block">
        {items.map((item) => (
          <li
            key={item.id}
            data-region-scope={item.region}
            className={item.id.startsWith('rules-') ? 'max-lg:hidden lg:pl-4' : undefined}
          >
            <a href={`#${item.id}`} className="sx-action">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default AboutJumpList;
