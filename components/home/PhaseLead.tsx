import Link from 'next/link';

import Arrow from '../ui/Arrow';
import type { PhaseLeadView } from './home-data';

/**
 * The one sentence at the top of a league panel that says where THAT league's season is
 * (SPEC §10.1, DESIGN §8).
 *
 * The house rule is "say what is true, say when it changes", so every phase names a real date from
 * the config or the snapshot (home-data.ts builds the copy), and the noisiest window — before
 * league play, when the tables are legitimately empty while non-league games are being played —
 * gets a full sentence rather than a confusing blank table. In the ordinary middle of the league
 * season this renders NOTHING, because the fold is worth more than a banner.
 *
 * It is commentary, so it sits on the inset plane (`.sx-inset`, surface-2), never in a card.
 */
export interface PhaseLeadProps {
  lead: PhaseLeadView | null;
  className?: string;
}

export function PhaseLead({ lead, className }: PhaseLeadProps) {
  if (!lead) return null;
  return (
    <p className={['sx-inset m-0 max-w-prose text-meta', className].filter(Boolean).join(' ')}>
      <span className="font-semibold text-ink">{lead.lead}</span>
      {lead.body ? ` ${lead.body}` : null}
      {lead.link ? (
        <>
          {' '}
          <Link href={lead.link.href} prefetch={false} className="text-accent hover:underline">
            {lead.link.label} <Arrow />
          </Link>
        </>
      ) : null}
    </p>
  );
}

export default PhaseLead;
