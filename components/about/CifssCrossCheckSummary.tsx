import { CIFSS_NOTES } from '../../lib/cifss-crosscheck';
import { formatStamp } from '../../lib/format';
import type { CifssCrossCheck, CifssOnlyRow } from '../../lib/types';

import ExternalLink from '../ui/ExternalLink';

/**
 * The cifsshome.org score cross-check (/about#cross-check, lib/cifss-crosscheck.ts). Report only:
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
    <div className="mt-stack">
      <p className="max-w-prose text-body text-ink-2">{intro}</p>
      <ul className="sx-list mt-2 max-w-prose">
        {rows.map((row) => (
          <li key={row.contestId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta">
            <span>
              {row.label} <span className="text-ink-3">&middot; {row.dateKey}</span>{' '}
              <span className="sx-num text-ink-2">
                {row.cifss.away}&ndash;{row.cifss.home}
              </span>
              {row.note !== sharedNote ? <span className="block text-ink-3">{row.note}</span> : null}
            </span>
            <ExternalLink href={row.cifssUrl} arrow={false}>
              cifsshome.org
            </ExternalLink>
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
      <p className="max-w-prose text-body text-ink-2">
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
        <div className="sx-card sx-flush mt-4 max-w-prose">
          <table className="sx-table text-meta">
            <caption className="sr-only">Games where MaxPreps and cifsshome.org publish different scores</caption>
            <thead>
              <tr>
                <th scope="col" className="pl-4">
                  Game
                </th>
                <th scope="col" className="w-px px-3 text-right tracking-normal">
                  MaxPreps
                </th>
                <th scope="col" className="w-px pl-3 pr-4 text-right tracking-normal">
                  cifsshome
                </th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((row) => (
                <tr key={row.contestId}>
                  <td className="py-3 pl-4">
                    {row.label}
                    <span className="block text-ink-3">
                      {row.dateKey} &middot; {row.note}{' '}
                      <ExternalLink href={row.cifssUrl} arrow={false} className="underline">
                        cifsshome.org
                      </ExternalLink>
                    </span>
                  </td>
                  <td className="sx-num whitespace-nowrap px-3 py-3 text-right text-cell font-semibold text-ink">
                    {row.maxpreps.away}&ndash;{row.maxpreps.home}
                  </td>
                  <td className="sx-num whitespace-nowrap py-3 pl-3 pr-4 text-right text-cell text-ink-2">
                    {row.cifss.away}&ndash;{row.cifss.home}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
