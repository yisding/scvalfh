import type { ReactNode } from 'react';

/**
 * One card of /about#sources' list (a `<dl>`): the source's name and what it is used for, a paragraph,
 * and its links as pills pinned to the card's foot. `wide` spans both columns from `md` (the section
 * cards); `regionScope` is the card's `data-region-scope` (DESIGN-socal §2.4), absent for a source both
 * regions use.
 */
export interface SourceCardProps {
  title: ReactNode;
  kicker: ReactNode;
  links: ReactNode;
  regionScope?: 'norcal' | 'socal';
  wide?: boolean;
  children: ReactNode;
}

export function SourceCard({ title, kicker, links, regionScope, wide = false, children }: SourceCardProps) {
  return (
    <div data-region-scope={regionScope} className={wide ? 'sx-card flex flex-col p-5 md:col-span-2' : 'sx-card flex flex-col p-5'}>
      <dt>
        <span className="block text-lead text-ink">{title}</span>
        <span className="mt-0.5 block text-meta text-ink-3">{kicker}</span>
      </dt>
      <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
        <span className="block">{children}</span>
        <span className="mt-auto flex flex-wrap gap-2 pt-3">{links}</span>
      </dd>
    </div>
  );
}

export default SourceCard;
