import type { AboutView } from './about-view';

/**
 * The /about jump list, rendered twice as two of the page's grid children (DESIGN §10.5): the "On this
 * page" disclosure below `lg` (`variant="disclosure"`), and the sticky rail beside the sections from
 * `lg` (`variant="rail"`). Each entry carries its league's region (`data-region-scope`), so the reader's
 * region's rules entries show.
 */
export function AboutToc({ items, variant }: { items: AboutView['toc']; variant: 'disclosure' | 'rail' }) {
  if (variant === 'disclosure') {
    return (
      <details data-twin className="sx-inset sx-disclosure mt-8 lg:hidden">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li key={item.id} data-region-scope={item.region}>
                <a href={`#${item.id}`} className="sx-action min-h-11 text-meta text-ink-2 hover:text-accent hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    );
  }
  return (
    <nav
      data-twin
      aria-label="Sections on this page"
      className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-10 lg:block lg:sticky lg:top-[5rem]"
    >
      <div className="sx-card p-4">
        <p className="m-0 text-micro font-medium text-ink-3">On this page</p>
        <ul className="m-0 mt-2 list-none p-0">
          {items.map((item) => (
            <li key={item.id} data-region-scope={item.region}>
              <a href={`#${item.id}`} className="sx-action min-h-8 text-meta text-ink-2 hover:text-accent hover:underline">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export default AboutToc;
