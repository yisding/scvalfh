import { timeOfDay } from '../../lib/format';
import { JvFootnote } from '../teams/TeamJvGames';
import type { JvListSummary, JvRowView } from '../teams/jv-view';
import { describeGame, statusLabelIsTime, type SideView } from '../ui/describe-game';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import StatusLabel from '../ui/StatusLabel';

/**
 * A day page's JV games: one compact card, a row per game — the time (or the status once there
 * is one), then the away and home school each with its score — under the varsity slate and never
 * mixed into it. Rows are not links: a JV game has no page of its own. A score from si.com
 * carries the † (StatusLabel), and a MaxPreps score si.com reports differently gets one line under
 * its row.
 */
export function JvDayGames({ view }: { view: JvListSummary & { rows: JvRowView[] } }) {
  return (
    <>
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {view.rows.map(({ game, differsNote }) => {
            const display = describeGame(game);
            const isTime = statusLabelIsTime(game, display.statusLabel);
            return (
              <li key={game.contestId}>
                <div className="grid min-h-row-1 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 px-gutter py-2 text-meta">
                  <span className="sr-only">{display.sentence}</span>
                  <span className="flex flex-col items-start gap-1" aria-hidden="true">
                    {isTime ? (
                      <span className="sx-num text-cell text-ink-2">
                        {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
                      </span>
                    ) : (
                      <StatusLabel display={display} showChips={false} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5" aria-hidden="true">
                    <JvSide side={display.away} showScore={display.showScores} />
                    <JvSide side={display.home} showScore={display.showScores} />
                  </span>
                </div>
                {differsNote ? <p className="m-0 px-gutter pb-2 text-meta text-ink-3">{differsNote}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
      <JvFootnote summary={view} />
    </>
  );
}

function JvSide({ side, showScore }: { side: SideView; showScore: boolean }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className={`min-w-0 truncate ${nameClass(side)}`}>{side.shortName}</span>
      {showScore ? <ScoreGlyph side={side} size="meta" className="shrink-0" /> : null}
    </span>
  );
}

export default JvDayGames;
