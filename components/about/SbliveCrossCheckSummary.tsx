import { formatStamp } from '../../lib/format';
import type { SbliveCrossCheck } from '../../lib/types';

import ExternalLink from '../ui/ExternalLink';

/**
 * The SBLive/SI score cross-check (SPEC §5.7, DESIGN §9, /about#cross-check).
 *
 * MaxPreps is never overwritten: a game where the two sources publish different numbers is
 * shown with the MaxPreps score (and listed below), and a game SBLive has scored that MaxPreps
 * has not is left unreported on this site rather than backfilled from a secondary source.
 */
export interface SbliveCrossCheckSummaryProps {
  cross: SbliveCrossCheck;
}

export function SbliveCrossCheckSummary({ cross }: SbliveCrossCheckSummaryProps) {
  const { compared, agreements, conflicts, sbliveOnlyScored, sbliveFetchedAt } = cross;
  // `compared` is the JOIN — games matched on date and teams. A matched row whose SBLive side has no
  // numbers yet falls into neither `agreements` nor `conflicts`, so reporting only those two left
  // four of twenty-nine games unaccounted for in a sentence that claimed all twenty-nine had been
  // matched to a SCORE. Both figures are named, and the remainder is stated rather than dropped.
  const scored = agreements + conflicts.length;
  const unscored = Math.max(0, compared - scored - sbliveOnlyScored.length);
  return (
    <div>
      <p className="max-w-prose text-body text-ink-2">
        As of the {formatStamp(sbliveFetchedAt)} run, {compared} MaxPreps game
        {compared === 1 ? '' : 's'} matched an SBLive/SI row by date and teams. {scored} of{' '}
        {compared === 1 ? 'those' : 'them'} had a score on both sides: {agreements} agreed on both
        numbers exactly
        {conflicts.length > 0
          ? `, ${conflicts.length} disagreed. We publish MaxPreps' score either way, and every disagreement is listed below with a deep link.`
          : ' and none disagreed.'}
        {unscored > 0
          ? ` The other ${unscored} ${unscored === 1 ? 'has' : 'have'} no score on SBLive/SI yet.`
          : ''}
      </p>
      {conflicts.length > 0 ? (
        <div className="sx-card sx-flush mt-4 max-w-[66ch]">
          {/* The `px-2` on the middle column puts a gutter BETWEEN the two right-aligned source
              heads: without it they render as one run-together string, "MAXPREPSSBLIVE/SI". */}
          <table className="sx-table text-meta">
            <caption className="sr-only">
              Games where MaxPreps and SBLive/SI publish different scores
            </caption>
            <thead>
              <tr>
                <th scope="col" className="pl-4">
                  Game
                </th>
                <th scope="col" className="px-2 text-right">
                  MaxPreps
                </th>
                <th scope="col" className="pr-4 text-right">
                  SBLive/SI
                </th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((row) => (
                <tr key={row.contestId}>
                  <td className="pl-4">
                    {row.label}
                    <span className="block text-ink-3">
                      {row.dateKey} &middot; {row.note}
                    </span>
                  </td>
                  <td className="sx-num px-2 py-3 text-right text-cell font-semibold text-ink">
                    {row.maxpreps.away}&ndash;{row.maxpreps.home}
                  </td>
                  <td className="sx-num py-3 pr-4 text-right text-cell text-ink-2">
                    {row.sblive.away}&ndash;{row.sblive.home}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {sbliveOnlyScored.length > 0 ? (
        <div className="mt-stack">
          <p className="max-w-prose text-body text-ink-2">
            SBLive/SI has published a score for {sbliveOnlyScored.length} game
            {sbliveOnlyScored.length === 1 ? '' : 's'} that MaxPreps has not. We do not backfill
            scores from a secondary source, so these stay unreported on this site until MaxPreps
            publishes them:
          </p>
          <ul className="sx-list mt-2 max-w-[66ch]">
            {sbliveOnlyScored.map((row) => (
              <li
                key={row.contestId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta"
              >
                <span>
                  {row.label} <span className="text-ink-3">&middot; {row.dateKey}</span>
                </span>
                {row.sbliveUrl ? (
                  <ExternalLink href={row.sbliveUrl} arrow={false}>
                    SBLive/SI
                  </ExternalLink>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default SbliveCrossCheckSummary;
