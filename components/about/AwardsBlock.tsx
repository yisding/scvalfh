import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { ordinal } from '../../lib/format';
import type { HistoryAwards, HistoryPlayer } from '../../lib/history';

/**
 * The 2025-26 all-league awards (DESIGN §3.9): overall award lines, then First Team / Second
 * Team / Honorable Mention as `<dl>`s. `value` on an overall award is the PDF's right-hand side
 * printed verbatim — the three leagues in this file wrote it differently, so this site does not
 * try to normalize it.
 */
export interface AwardsBlockProps {
  awards: HistoryAwards | null;
  /** "Varsity" or "JV" — used only in the empty-state sentence. */
  levelLabel: string;
}

function PlayerList({ title, players }: { title: string; players: HistoryPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <div>
      <dt className="font-mono text-kicker font-semibold tracking-[0.10em] text-ink-3 uppercase">
        {title}
      </dt>
      <dd className="m-0 mt-1.5 space-y-1.5">
        {players.map((p, i) => {
          const team = p.slug ? getTeamBySlug(p.slug) : undefined;
          return (
            <div key={i} className="flex flex-wrap items-baseline gap-x-1.5 text-meta text-ink-2">
              <span className="text-body text-ink">{p.player}</span>
              <span>
                {p.position} &middot; {ordinal(p.year)} grade &middot;
              </span>
              {/* `prefetch={false}` for the reason the nav and the standings rows carry it
                  (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route
                  here is STATIC, so Next 16's `auto` downloads the whole linked route the moment
                  the link scrolls into view, and every award names a school, so one block is dozens
                  of these. Navigation still fetches on click. */}
              {team ? (
                <Link
                  href={`/teams/${team.slug}`}
                  prefetch={false}
                  className="text-accent hover:underline"
                >
                  {p.school}
                </Link>
              ) : (
                <span>{p.school}</span>
              )}
            </div>
          );
        })}
      </dd>
    </div>
  );
}

export function AwardsBlock({ awards, levelLabel }: AwardsBlockProps) {
  if (!awards) {
    return (
      <p className="py-2 text-meta text-ink-3">
        No {levelLabel.toLowerCase()} all-league awards were published for this division.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {awards.overall.length > 0 ? (
        <dl className="m-0 space-y-1">
          {awards.overall.map((o, i) => (
            <div key={i} className="flex flex-wrap gap-x-2 text-meta">
              <dt className="text-ink-2">{o.award}</dt>
              <dd className="m-0 font-semibold text-ink">{o.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="m-0 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <PlayerList title="First team" players={awards.firstTeam} />
        <PlayerList title="Second team" players={awards.secondTeam} />
      </dl>
      {awards.honorableMention.length > 0 ? (
        <dl className="m-0">
          <PlayerList title="Honorable mention" players={awards.honorableMention} />
        </dl>
      ) : null}
    </div>
  );
}

export default AwardsBlock;
