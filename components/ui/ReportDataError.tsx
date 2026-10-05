import { DATA_CORRECTIONS_URL } from '../layout/site';

import ExternalLink from './ExternalLink';

/**
 * The in-page invitation to report a data error, for the pages a reader checks against what they
 * saw at the field: a team page and a game page, at the end of their Elsewhere block, next to the
 * source links a reader would compare against first. One meta-size line, not a card or a banner:
 * it has to be easy to find without competing with the data. The footer carries the same link on
 * every page (components/layout/Attribution.tsx); this one is where the doubt arises.
 *
 * The link sits inside a sentence, so it takes no 24px box of its own (WCAG 2.5.8's inline
 * exception) and keeps the sentence's line height.
 */
export interface ReportDataErrorProps {
  /** What a reader on this page would find wrong: 'a score, date or name'. */
  what: string;
  className?: string;
}

export function ReportDataError({ what, className }: ReportDataErrorProps) {
  return (
    <p className={['m-0 max-w-prose text-meta text-ink-2', className].filter(Boolean).join(' ')}>
      Spot a wrong {what}?{' '}
      <ExternalLink href={DATA_CORRECTIONS_URL}>Report a data error</ExternalLink>
    </p>
  );
}

export default ReportDataError;
