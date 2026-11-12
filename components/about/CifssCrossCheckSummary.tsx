import { CIFSS_NOTES } from '../../lib/crosscheck/cifss-notes';
import { formatStamp, shortDate } from '../../lib/format';
import type { CifssCrossCheck, CifssOnlyRow } from '../../lib/types';

import ExternalLink from '../ui/ExternalLink';

/**
 * The cifsshome.org score cross-check (/about#cross-check, lib/crosscheck/cifss-crosscheck.ts). Report only:
 * MaxPreps' score always stands and nothing from the widget is published as a result. Schools enter
 * their own rows there, so the summary says what a missing row does NOT mean, and lists only what
 * a scored row says: disagreements, scores MaxPreps lacks, and games MaxPreps has no contest for.
 */
export interface CifssCrossCheckSummaryProps {
  cross: CifssCrossCheck;
}

/** `sharedNote`: the note every row carries, said once in the intro instead of under each row. */
function OnlyList({ rows, intro, sharedNote }: { rows: readonly CifssOnlyRow[]; intro: string; sharedNote?: string }) {
  return (
    <div className="mt-4">
      <p className="m-0 max-w-prose text-body text-ink-2">{intro}</p>
      <ul className="sx-list mt-2 max-w-prose">
        {rows.map((row) => (
          <li key={row.contestId} className="py-2 text-cell text-ink-2">
            <span className="flex flex-wrap items-baseline gap-x-3 text-body text-ink">
              <span>{row.label}</span>
              <span className="sx-num">
                {row.cifss.away}&ndash;{row.cifss.home}
              </span>
              <time dateTime={row.dateKey} className="sx-num text-ink-2">
                {shortDate(row.dateKey)}
              </time>
              <ExternalLink href={row.cifssUrl} arrow={false} className="sx-link ml-auto text-cell">
                cifsshome.org
              </ExternalLink>
            </span>
            {row.note !== sharedNote ? <span className="block">{row.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CifssCrossCheckSummary({ cross }: CifssCrossCheckSummaryProps) {
  const { compared, agreements, conflicts, cifssOnlyScored, notOnMaxPreps, cifssFetchedAt } = cross;
  return (
    <div>
      <p className="m-0 max-w-prose text-body text-ink-2">
        cifsshome.org is the CIF Southern Section&rsquo;s schedule-and-score site, and it carries the
        other Sections&rsquo; games too. Schools enter their own schedules and scores there, so many
        games are missing or unscored, and a missing game says nothing about MaxPreps. We read every
        Section our teams play in, season to date, and compare its scores with MaxPreps&rsquo;; it never
        changes a score, record or standing here. As of the {formatStamp(cifssFetchedAt)} run,{' '}
        {compared} game{compared === 1 ? '' : 's'} had a score on both sides: {agreements} agreed on
        both numbers exactly
        {conflicts.length > 0
          ? `, ${conflicts.length} disagreed. We publish MaxPreps’ score, and every disagreement is listed below.`
          : ' and none disagreed.'}
      </p>
      {conflicts.length > 0 ? (
        <table className="sx-table mt-2 max-w-prose">
          <caption className="sr-only">Games where MaxPreps and cifsshome.org publish different scores</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Game
              </th>
              <th scope="col">MaxPreps</th>
              <th scope="col">cifsshome</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((row) => (
              <tr key={row.contestId}>
                <td className="py-2 text-left whitespace-normal">
                  {row.label}
                  <span className="block text-cell text-ink-2">
                    <time dateTime={row.dateKey}>{shortDate(row.dateKey)}</time>. {row.note}{' '}
                    <ExternalLink href={row.cifssUrl} arrow={false} className="sx-link">
                      cifsshome.org
                    </ExternalLink>
                  </span>
                </td>
                <td className="sx-num w-px pl-4 align-top font-semibold">
                  {row.maxpreps.away}&ndash;{row.maxpreps.home}
                </td>
                <td className="sx-num w-px pl-4 align-top text-ink-2">
                  {row.cifss.away}&ndash;{row.cifss.home}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {cifssOnlyScored.length > 0 ? (
        <OnlyList
          rows={cifssOnlyScored}
          intro={`cifsshome.org has a score for ${cifssOnlyScored.length} game${cifssOnlyScored.length === 1 ? '' : 's'} MaxPreps lists without one. Each stays unreported here:`}
        />
      ) : null}
      {notOnMaxPreps.length > 0 ? (
        <OnlyList
          rows={notOnMaxPreps}
          sharedNote={CIFSS_NOTES.notOnMaxPreps}
          intro={`cifsshome.org scores ${notOnMaxPreps.length} game${notOnMaxPreps.length === 1 ? '' : 's'} with one of our teams that MaxPreps has no game for within three days of the date. Schools enter their own rows there, so ${notOnMaxPreps.length === 1 ? 'it' : 'each'} may be a scrimmage or a game played on another date. None is published:`}
        />
      ) : null}
    </div>
  );
}

export default CifssCrossCheckSummary;
