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
      <p className="m-0 max-w-prose text-body text-ink-2">
        No score on this site comes from si.com in the most recent run: every published result is
        MaxPreps&rsquo; own.
      </p>
    );
  }
  return (
    <ul className="m-0 flex max-w-prose list-none flex-col gap-3 p-0">
      {rows.map((row) => (
        <li key={row.contestId} className="sx-card p-4 text-meta text-ink-2">
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-body text-ink">
              <Link href={gameHref(row.contestId)} prefetch={false} className="sx-action hover:underline">
                {row.label}
              </Link>
            </span>
            <span className="sx-num text-ink-3">
              <time dateTime={row.dateKey}>{shortDate(row.dateKey)}</time>
            </span>
          </p>
          <dl className="m-0 mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
            <dt className="text-ink-3">si.com</dt>
            <dd className="sx-num m-0 font-semibold text-ink">{score(row.sblive)} (published)</dd>
            <dt className="text-ink-3">MaxPreps</dt>
            <dd className="sx-num m-0">
              {row.maxpreps ? score(row.maxpreps) : row.maxprepsUrl ? 'no score' : 'no MaxPreps contest'}
            </dd>
            <dt className="text-ink-3">Rule</dt>
            <dd className="m-0">{BACKFILL_RULE_WORDS[row.rule]}.</dd>
          </dl>
          <p className="m-0 mt-2">{row.note}</p>
          {/* Standalone links: `.sx-action` gives each its own 24px box (WCAG 2.5.8); gap-1 stands in
              for the space before the arrow, which inline-flex drops. */}
          <p className="m-0 mt-2 flex flex-wrap gap-x-3">
            <ExternalLink href={row.sbliveUrl} className="sx-action gap-1">
              si.com game
            </ExternalLink>
            {row.maxprepsUrl ? (
              <ExternalLink href={row.maxprepsUrl} className="sx-action gap-1">
                MaxPreps game
              </ExternalLink>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default BackfillTable;
