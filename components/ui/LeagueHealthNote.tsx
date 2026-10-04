import { getLeagueHealth } from '../../lib/data';
import { formatStamp } from '../../lib/format';
import type { LeagueId } from '../../lib/types';

/**
 * The league's data-health note (SPEC §10.0, §10.2). A SERVER component: league-scoped pages
 * render it above their first table. It renders NOTHING while the league is `fresh`; otherwise an
 * inset note with the pipeline's reasons verbatim (plain sentences, safe to render as written) and,
 * when the league is `frozen` (its data carried from an earlier run), `Shown as of <stamp>.` with
 * the last fresh fetch in Pacific time.
 *
 * Never a hue, never an icon alone: the words are the signal.
 */
export interface LeagueHealthNoteProps {
  leagueId: LeagueId;
  className?: string;
}

export function LeagueHealthNote({ leagueId, className }: LeagueHealthNoteProps) {
  const health = getLeagueHealth(leagueId);
  if (health.state === 'fresh') return null;
  const asOf = health.state === 'frozen' && health.lastFreshAt ? health.lastFreshAt : null;
  if (health.reasons.length === 0 && asOf === null) return null;
  return (
    <div role="note" className={['sx-inset text-ink-2', className].filter(Boolean).join(' ')}>
      {health.reasons.map((reason) => (
        <p key={reason} className="m-0">
          {reason}
        </p>
      ))}
      {asOf !== null ? (
        <p className="m-0">
          Shown as of{' '}
          <time dateTime={asOf} className="sx-num">
            {formatStamp(asOf)}
          </time>
          .
        </p>
      ) : null}
    </div>
  );
}

export default LeagueHealthNote;
