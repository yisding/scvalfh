import Link from 'next/link';

import type { TeamSlug } from '../../lib/types';
import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import { GAME_LOG_ROW_GRID, GameLogRowBody } from '../ui/GameRow';
import type { JvListSummary, TeamJvView } from './jv-view';

/**
 * A team page's JV games (DESIGN §3.7's game log, one list): `Sep 14 (W) 4–0 vs Cupertino FINAL`.
 *
 * The rows are the varsity log's rows (GameLogRowBody, the same four columns) without the link —
 * a JV game has no page of its own — and without chips: a JV game is never a league, non-league or
 * postseason game for any table, so tagging it NL would claim something we do not decide. A score
 * from si.com carries the †, as everywhere else; a MaxPreps score si.com reports differently gets
 * one line under its row saying so. The footnote says what the list is and is not.
 */
export function TeamJvGames({ view, perspective }: { view: TeamJvView; perspective: TeamSlug }) {
  if (view.rows.length === 0) {
    return (
      <EmptyState
        heading={view.emptyHeading}
        action={view.maxprepsUrl ? { href: view.maxprepsUrl, label: 'MaxPreps JV schedule', external: true } : undefined}
      >
        {view.emptyBody}
      </EmptyState>
    );
  }
  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {view.rows.map(({ game, differsNote }) => (
            <li key={game.contestId}>
              <div className={GAME_LOG_ROW_GRID}>
                <GameLogRowBody game={game} perspective={perspective} showChips={false} />
              </div>
              {differsNote ? <p className="m-0 px-gutter pb-2 text-meta text-ink-3">{differsNote}</p> : null}
            </li>
          ))}
        </ol>
      </div>
      <JvFootnote summary={view} />
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {view.maxprepsUrl ? (
          <li>
            <ExternalLink href={view.maxprepsUrl} className="sx-pill sx-pill-ring">
              MaxPreps JV schedule
            </ExternalLink>
          </li>
        ) : null}
        {view.sbliveUrl ? (
          <li>
            <ExternalLink href={view.sbliveUrl} className="sx-pill sx-pill-ring">
              si.com JV page
            </ExternalLink>
          </li>
        ) : null}
      </ul>
    </>
  );
}

/**
 * The one line under every JV list: listed, not counted; where the scores come from; the † when the
 * list has one; and a link to /about#jv. The link sits inside the sentence (WCAG 2.5.8's inline
 * exception), like the day page's legend.
 */
export function JvFootnote({ summary, className }: { summary: JvListSummary; className?: string }) {
  return (
    <p className={['mt-3 mb-0 max-w-prose text-meta text-ink-3', className].filter(Boolean).join(' ')}>
      JV games are listed here, never counted in a standings table. Scores are MaxPreps&rsquo;
      {summary.sbliveScores > 0 ? (
        <>
          ; a &dagger; marks a score from si.com where MaxPreps has none
        </>
      ) : null}
      .{' '}
      <Link href="/about#jv" prefetch={false} className="text-accent">
        How JV games are shown
      </Link>
    </p>
  );
}

export default TeamJvGames;
