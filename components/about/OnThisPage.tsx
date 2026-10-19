import type { TocEntry } from '@/views/about/about-view';

/**
 * /about's jump list, in its two twins (`data-twin`): below `lg` an "On this page" disclosure in the
 * content flow, from `lg` a sticky rail in the page grid's second column. One DOM order serves both
 * breakpoints (DESIGN §10.5), so the page renders this twice; the entries are the same and differ only
 * in their minimum height (a 44px touch target in the disclosure, a denser 32px in the rail). Each entry
 * carries its region's `data-region-scope`, so the reader's region's entries show.
 */
export interface OnThisPageProps {
  toc: readonly TocEntry[];
  variant: 'disclosure' | 'rail';
}

const ENTRY_CLASS: Readonly<Record<OnThisPageProps['variant'], string>> = {
  disclosure: 'sx-action min-h-11 text-meta text-ink-2 hover:text-accent hover:underline',
  rail: 'sx-action min-h-8 text-meta text-ink-2 hover:text-accent hover:underline',
};

function Entries({ toc, variant }: OnThisPageProps) {
  return toc.map((item) => (
    <li key={item.id} data-region-scope={item.region}>
      <a href={`#${item.id}`} className={ENTRY_CLASS[variant]}>
        {item.label}
      </a>
    </li>
  ));
}

export function OnThisPage({ toc, variant }: OnThisPageProps) {
  if (variant === 'disclosure') {
    return (
      <details data-twin className="sx-inset sx-disclosure mt-8 lg:hidden">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          <ul className="m-0 list-none p-0">
            <Entries toc={toc} variant={variant} />
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
          <Entries toc={toc} variant={variant} />
        </ul>
      </div>
    </nav>
  );
}

export default OnThisPage;
