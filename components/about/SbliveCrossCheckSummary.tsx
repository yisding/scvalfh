import { formatStamp, shortDate } from '../../lib/format';
import type { SbliveCrossCheck } from '../../lib/types';

import ExternalLink from '../ui/ExternalLink';

/**
 * The si.com (High School on SI, formerly SBLive) score cross-check (SPEC §10.8, DESIGN §9,
 * /about#cross-check), under owner decision D2: MaxPreps is the primary source; si.com's score is
 * published only when MaxPreps has no result for an official league game or its row is clearly
 * wrong (those rows are listed under /about#backfills). A plain disagreement keeps MaxPreps' score
 * and is listed below; a si.com-only score we did NOT publish is listed with the reason.
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
      <p className="m-0 max-w-prose text-body text-ink-2">
        MaxPreps is our primary source. When MaxPreps has no result for an official league game, or
        its row is clearly wrong, we publish High School on SI&rsquo;s score and mark it (see{' '}
        <a href="#backfills">
          Scores taken from si.com
        </a>
        ). As of the {formatStamp(sbliveFetchedAt)} run, {compared} MaxPreps game
        {compared === 1 ? '' : 's'} matched a si.com row by date and teams. {scored} of{' '}
        {compared === 1 ? 'those' : 'them'} had a score on both sides: {agreements} agreed on both
        numbers exactly
        {conflicts.length > 0
          ? `, ${conflicts.length} disagreed. Where neither of the clearly-wrong checks applies we publish MaxPreps’ score, and every disagreement is listed below.`
          : ' and none disagreed.'}
        {unscored > 0
          ? ` The other ${unscored} ${unscored === 1 ? 'has' : 'have'} no score on si.com yet.`
          : ''}
      </p>
      {conflicts.length > 0 ? (
        <table className="sx-table mt-2 max-w-prose">
          <caption className="sr-only">Games where MaxPreps and si.com publish different scores</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Game
              </th>
              <th scope="col">MaxPreps</th>
              <th scope="col">si.com</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((row) => (
              <tr key={row.contestId}>
                <td className="py-2 text-left whitespace-normal">
                  {row.label}
                  <span className="block text-cell text-ink-2">
                    <time dateTime={row.dateKey}>{shortDate(row.dateKey)}</time>. {row.note}
                  </span>
                </td>
                <td className="sx-num w-px pl-4 align-top font-semibold">
                  {row.maxpreps.away}&ndash;{row.maxpreps.home}
                </td>
                <td className="sx-num w-px pl-4 align-top text-ink-2">
                  {row.sblive.away}&ndash;{row.sblive.home}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {sbliveOnlyScored.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 max-w-prose text-body text-ink-2">
            si.com has a score for {sbliveOnlyScored.length} game
            {sbliveOnlyScored.length === 1 ? '' : 's'} that MaxPreps has not, and that our rules for missing or
            wrong scores did not publish. Each stays unreported here, with the reason:
          </p>
          <ul className="sx-list mt-2 max-w-prose">
            {sbliveOnlyScored.map((row) => (
              <li key={row.contestId} className="py-2 text-cell text-ink-2">
                <span className="flex flex-wrap items-baseline gap-x-3 text-body text-ink">
                  <span>{row.label}</span>
                  <time dateTime={row.dateKey} className="sx-num text-ink-2">
                    {shortDate(row.dateKey)}
                  </time>
                  {row.sbliveUrl ? (
                    <ExternalLink href={row.sbliveUrl} arrow={false} className="sx-link ml-auto text-cell">
                      si.com
                    </ExternalLink>
                  ) : null}
                </span>
                {row.note ? <span className="block">{row.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default SbliveCrossCheckSummary;
