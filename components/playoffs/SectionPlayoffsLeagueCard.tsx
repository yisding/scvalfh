import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import { listWords } from '@/lib/format/words';
import type { SectionLeagueCardData } from '@/views/playoffs/playoffs-view';

/**
 * One San Diego conference's card (`id=<league>`, the target of its chip and jump link): per division,
 * the table's leaders as things stand, and each team's playoff division from the Section's 2026 Divisions
 * sheet. Open Division teams are drawn from Division I at the end of the regular season, so the card
 * names Division I and Division II only, and never an Open place.
 */
export default function SectionPlayoffsLeagueCard({ card }: { card: SectionLeagueCardData }) {
  const { summary, divisions } = card;
  return (
    <div id={summary.id} className="sx-card mt-6 p-5 md:p-6">
      <h3 className="m-0 text-lead text-ink">{`${summary.shortName} — ${summary.name}`}</h3>
      <div className="mt-2 grid gap-5 md:grid-cols-2">
        {divisions.map((d) => (
          <div key={d.id} className="min-w-0">
            {d.heading ? <h4 className="m-0 text-body font-semibold text-ink">{d.heading}</h4> : null}
            <p className="mt-1 mb-0 text-meta text-ink-2">
              {d.leaders.length > 0
                ? `${listWords(d.leaders.map((t) => t.name), '&')} ${d.leaders.length === 1 ? 'leads' : 'lead'} the table, ${d.leaders[0].pts} pts.`
                : 'No league results yet.'}{' '}
              <Link href={`/standings/${summary.id}#${d.id}`} prefetch={false} className="text-accent hover:underline">
                Table <Arrow />
              </Link>
            </p>
            <dl className="mt-2 mb-0 text-meta">
              {(['I', 'II'] as const).map((which) =>
                d.playoffDivision[which].length > 0 ? (
                  <div key={which} className="mt-1 flex flex-wrap gap-x-2">
                    <dt className="font-semibold text-ink">{`Division ${which}:`}</dt>
                    <dd className="m-0 text-ink-2">{listWords(d.playoffDivision[which])}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-4 mb-0 max-w-prose text-meta text-ink-3">
        Each team’s playoff division is from the Section’s 2026 Divisions sheet; the Open Division’s eight
        are drawn from Division I at the end of the regular season. A designated league champion (not
        co-champions) is guaranteed at least a play-in game, and {summary.shortName} names its champion,
        not this table.
      </p>
    </div>
  );
}
