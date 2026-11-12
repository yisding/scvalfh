import Link from 'next/link';

import { shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { BackfillRow } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';

/**
 * Every si.com score this site published (owner decision D2, SPEC §7.9; /about#backfills): the
 * date, the game, si.com's value, what MaxPreps said ("no MaxPreps contest" or "no score" when it
 * said nothing), the rule that applied in words, and both sources' links. Nothing is backfilled
 * silently: a row here is also marked on its game everywhere it is shown.
 *
 * Scores read away–home, matching the "Away at Home" label.
 */
export interface BackfillTableProps {
  rows: readonly BackfillRow[];
}

const BACKFILL_RULE_WORDS: Readonly<Record<BackfillRow['rule'], string>> = {
  'absent-fixture': 'MaxPreps has no contest for this official league game',
  'score-pending': 'MaxPreps lists the game without a score',
  'contradictory-result': 'MaxPreps’ win/loss flags contradict its own score',
  'off-schedule-date': 'The official schedule shows the game was not played on MaxPreps’ date',
  'phantom-tie': 'MaxPreps shows a scoreless tie that si.com reports as decided, in a league with no overtime',
};

function score(v: { home: number; away: number }): string {
  return `${v.away}–${v.home}`;
}

export function BackfillTable({ rows }: BackfillTableProps) {
  if (rows.length === 0) {
    return (
      <p className="sx-empty max-w-prose">
        No score on this site comes from si.com in the most recent run: every published result is
        MaxPreps&rsquo; own.
      </p>
    );
  }
  return (
    <ul className="sx-list max-w-prose">
      {rows.map((row) => (
        <li key={row.contestId} className="py-3 text-cell text-ink-2">
          <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-body text-ink">
            <Link href={gameHref(row.contestId)} prefetch={false} className="sx-teamlink font-semibold">
              {row.label}
            </Link>
            <time dateTime={row.dateKey} className="sx-num text-ink-2">
              {shortDate(row.dateKey)}
            </time>
          </p>
          <dl className="m-0 mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
            <dt>si.com</dt>
            <dd className="m-0 text-ink">
              <span className="sx-num font-semibold">{score(row.sblive)}</span> (published)
            </dd>
            <dt>MaxPreps</dt>
            <dd className="m-0">
              {row.maxpreps ? (
                <span className="sx-num">{score(row.maxpreps)}</span>
              ) : row.maxprepsUrl ? (
                'no score'
              ) : (
                'no MaxPreps contest'
              )}
            </dd>
            <dt>Rule</dt>
            <dd className="m-0">{BACKFILL_RULE_WORDS[row.rule]}.</dd>
          </dl>
          <p className="m-0 mt-1">{row.note}</p>
          <ul className="sx-linkrow mt-0">
            <li>
              <ExternalLink href={row.sbliveUrl} className="sx-action">
                si.com game
              </ExternalLink>
            </li>
            {row.maxprepsUrl ? (
              <li>
                <ExternalLink href={row.maxprepsUrl} className="sx-action">
                  MaxPreps game
                </ExternalLink>
              </li>
            ) : null}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default BackfillTable;
