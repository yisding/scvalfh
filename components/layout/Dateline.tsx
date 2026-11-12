import { getFetchedAt, getSitePhase } from '../../lib/data';

import { BUILD_INSTANT } from './build-instant';
import LastUpdated from './LastUpdated';

/**
 * The long freshness stamp, "Updated Wed Nov 11, 1:03 PM PT", as plain text (DESIGN §33). Used where
 * the long form is wanted in a page's own text: /about, through PageHeader's `stamp`. Every other
 * page shows the short form once, beside its scores (LastUpdated `variant="time"`), and the footer
 * carries the long one.
 */
export interface DatelineProps {
  className?: string;
  /** @deprecated accepted until pages migrate; ignored (the stamp stands alone). */
  children?: React.ReactNode;
  /** @deprecated accepted until pages migrate; `false` renders nothing. */
  stamp?: boolean;
}

export function Dateline({ className, stamp = true }: DatelineProps) {
  if (!stamp) return null;
  return (
    <LastUpdated
      variant="dateline"
      at={getFetchedAt()}
      now={BUILD_INSTANT}
      seasonComplete={getSitePhase() === 'complete'}
      className={className}
    />
  );
}

export default Dateline;
