import { formatStamp } from '@/lib/format/dates';
import type { LeagueHealth } from '@/lib/model/health';

/**
 * The league's data-health note (SPEC §10.0, §10.2). A SERVER component: league-scoped pages
 * render it above their first table. It renders NOTHING while the league is `fresh`; otherwise an
 * inset note with the pipeline's reasons verbatim (plain sentences, safe to render as written) and,
 * when the league is `frozen` (its data carried from an earlier run), `Shown as of <stamp>.` with
 * the last fresh fetch in Pacific time. The caller hands it the league's `getLeagueHealth(id)`
 * (lib/queries/leagues.ts), read by the page or its view: a component never reads the snapshot.
 *
 * Never a hue, never an icon alone: the words are the signal.
 */
export interface LeagueHealthNoteProps {
  health: LeagueHealth;
  className?: string;
}

export function LeagueHealthNote({ health, className }: LeagueHealthNoteProps) {
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
