import { getFetchedAt, getSitePhase } from '../../lib/data';

import { BUILD_INSTANT } from './build-instant';
import LastUpdated from './LastUpdated';

/**
 * The line under every page's h1 (DESIGN §33): one or two sentences about the page, then the
 * freshness stamp, "Updated Wed Nov 11, 1:03 PM PT." It is ordinary wrapping text: nothing on the
 * paragraph truncates or forbids wrapping, so the stamp can never be cut off (only the date and
 * time themselves stay on one line).
 */
export interface DatelineProps {
  children?: React.ReactNode;
  /** Appends the freshness stamp. Default true. */
  stamp?: boolean;
  className?: string;
}

export function Dateline({ children, stamp = true, className }: DatelineProps) {
  const hasWords = children !== undefined && children !== null && children !== false && children !== '';
  if (!hasWords && !stamp) return null;
  return (
    <p className={['sx-dateline', className].filter(Boolean).join(' ')}>
      {hasWords ? children : null}
      {hasWords && stamp ? ' ' : null}
      {stamp ? (
        <LastUpdated
          variant="dateline"
          at={getFetchedAt()}
          now={BUILD_INSTANT}
          seasonComplete={getSitePhase() === 'complete'}
        />
      ) : null}
    </p>
  );
}

export default Dateline;
