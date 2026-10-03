import { formatStamp } from '../../lib/format';
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
      <p className="max-w-prose text-body text-ink-2">
        MaxPreps is our primary source. When MaxPreps has no result for an official league game, or
        its row is clearly wrong, we publish High School on SI&rsquo;s score and mark it (see{' '}
        <a href="#backfills" className="text-accent hover:underline">
          Backfills
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
        // Capped at the same `max-w-prose` as the paragraph above it, so the card's right edge
        // sits on the text's edge (a private 66ch here once ran 10px past it).
        <div className="sx-card sx-flush mt-4 max-w-prose">
          {/* The `px-3` on the middle column puts a gutter BETWEEN the two right-aligned source
              heads: without it they render as one run-together string, "MAXPREPSSBLIVE/SI".
              The score columns are shrink-wrapped (`w-px` + nowrap) so the Game text gets the
              rest of the card, and their heads drop the caps tracking, which would otherwise
              trail after the last letter of a right-aligned head. */}
          <table className="sx-table text-meta">
            <caption className="sr-only">
              Games where MaxPreps and si.com publish different scores
            </caption>
            <thead>
              <tr>
                <th scope="col" className="pl-4">
                  Game
                </th>
                <th scope="col" className="w-px px-3 text-right tracking-normal">
                  MaxPreps
                </th>
                <th scope="col" className="w-px pl-3 pr-4 text-right tracking-normal">
                  si.com
                </th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((row) => (
                <tr key={row.contestId}>
                  <td className="py-3 pl-4">
                    {row.label}
                    <span className="block text-ink-3">
                      {row.dateKey} &middot; {row.note}
                    </span>
                  </td>
                  <td className="sx-num whitespace-nowrap px-3 py-3 text-right text-cell font-semibold text-ink">
                    {row.maxpreps.away}&ndash;{row.maxpreps.home}
                  </td>
                  <td className="sx-num whitespace-nowrap py-3 pl-3 pr-4 text-right text-cell text-ink-2">
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
            si.com has a score for {sbliveOnlyScored.length} game
            {sbliveOnlyScored.length === 1 ? '' : 's'} that MaxPreps has not, and that our backfill
            rules did not publish. Each stays unreported here, with the reason:
          </p>
          <ul className="sx-list mt-2 max-w-prose">
            {sbliveOnlyScored.map((row) => (
              <li
                key={row.contestId}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta"
              >
                <span>
                  {row.label} <span className="text-ink-3">&middot; {row.dateKey}</span>
                  {row.note ? <span className="block text-ink-3">{row.note}</span> : null}
                </span>
                {row.sbliveUrl ? (
                  <ExternalLink href={row.sbliveUrl} arrow={false}>
                    si.com
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
