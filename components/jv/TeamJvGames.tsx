import Link from 'next/link';

import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import { GAME_LOG_ROW_GRID, GameLogRowBody } from '../game-row/GameLogRow';
import type { JvListSummary, TeamJvView } from './jv-view';

/**
 * A team page's JV games (DESIGN §3.7's game log, one list): `Sep 14 (W) 4–0 vs Cupertino FINAL`.
 *
 * The rows are the varsity log's rows (GameLogRowBody, the same four columns) without the link —
 * a JV game has no page of its own. A JV league game (one whose varsity counterpart counts,
 * lib/jv/jv-standings.ts) carries its league chip, a non-league one the NL chip and rule, and a
 * same-division game no varsity game matched carries neither: it counts nowhere and we do not
 * guess. A score from si.com carries the †, as everywhere else; a MaxPreps score si.com reports
 * differently gets one line under its row saying so. A game listed from the league's own schedule is
 * noted `League schedule`.
 *
 * On Santa Catalina's page the list is York's (the view's `slot`): one line above it says why, and
 * each row reads from York's side (`perspective` is York's MaxPreps id).
 */
export function TeamJvGames({ view }: { view: TeamJvView }) {
  const { perspective } = view;
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
      {view.slot ? <p className="sx-note mt-0 mb-2">{view.slot.note}</p> : null}
      {/* The section spans the page from 1024: two columns of rows, read down then across. */}
      <ol className="sx-list lg:columns-2 lg:gap-x-10 [&>li]:break-inside-avoid">
        {view.rows.map(({ game, differsNote, chips, nonLeague, fromSchedule }) => (
          <li key={game.contestId}>
            <div className={nonLeague ? `${GAME_LOG_ROW_GRID} sx-nonleague` : GAME_LOG_ROW_GRID}>
              <GameLogRowBody
                game={game}
                perspective={perspective}
                showChips={chips}
                extraTag={fromSchedule ? JV_SCHEDULE_TAG : undefined}
              />
            </div>
            {differsNote ? <p className="sx-note mt-0 px-2 pb-2">{differsNote}</p> : null}
          </li>
        ))}
      </ol>
      <JvFootnote summary={view} />
      {view.maxprepsUrl || view.sbliveUrl ? (
        <ul className="sx-linkrow">
          {view.maxprepsUrl ? (
            <li>
              <ExternalLink href={view.maxprepsUrl} className="sx-action">
                {view.slot ? `${view.slot.name}’s MaxPreps JV schedule` : 'MaxPreps JV schedule'}
              </ExternalLink>
            </li>
          ) : null}
          {view.sbliveUrl ? (
            <li>
              <ExternalLink href={view.sbliveUrl} className="sx-action">
                {view.slot ? `${view.slot.name}’s si.com JV page` : 'si.com JV page'}
              </ExternalLink>
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

/**
 * The note on a JV game listed from the league's own schedule, and what a screen reader hears for it.
 * The words say what it is, so no key is needed under the list.
 */
export const JV_SCHEDULE_TAG = { text: 'League schedule', label: 'Listed from the league schedule; not on MaxPreps yet.' } as const;

/**
 * The one line under every JV list: the legend of the † when the list has one (a mark is never left
 * unexplained, SPEC §7.9), and the link to how JV games are shown (/about#jv), where the method text
 * lives. The link sits inside the line (WCAG 2.5.8's inline exception).
 */
export function JvFootnote({ summary, className }: { summary: JvListSummary; className?: string }) {
  return (
    <p className={['sx-note', className].filter(Boolean).join(' ')}>
      {summary.sbliveScores > 0 || summary.schoolSiteScores > 0 ? (
        <>
          &dagger; A score from{' '}
          {summary.sbliveScores > 0 && summary.schoolSiteScores > 0
            ? 'si.com or a school’s own athletics site'
            : summary.sbliveScores > 0
              ? 'si.com'
              : 'a school’s own athletics site'}
          , where MaxPreps has none.{' '}
        </>
      ) : null}
      <Link href="/about#jv" prefetch={false} className="sx-link inline-flex min-h-6 items-center">
        How JV games are shown
      </Link>
    </p>
  );
}

export default TeamJvGames;
