import { timeOfDay } from '@/lib/format';
import { JvFootnote } from '@/components/teams/TeamJvGames';
import type { JvListSummary, JvRowView } from '@/components/teams/jv-view';
import { describeGame, statusLabelIsTime, type SideView } from '@/components/ui/describe-game';
import { ScoreGlyph, nameClass } from '@/components/ui/ScoreGlyph';
import StatusLabel, { GameChips } from '@/components/ui/StatusLabel';

/**
 * A day page's JV games: one compact card, a row per game — the time (or the status once there
 * is one), then the away and home school each with its score — under the varsity slate and never
 * mixed into it. Rows are not links: a JV game has no page of its own. A JV league game carries
 * its league chip and a non-league one the NL chip and rule (lib/jv-standings.ts); a same-division
 * game no varsity game matched carries neither. A score from si.com carries the † (StatusLabel), and
 * a MaxPreps score si.com reports differently gets one line under its row.
 */
export function JvDayGames({ view }: { view: JvListSummary & { rows: JvRowView[] } }) {
  return (
    <>
      <div className="sx-card sx-flush sx-bleed md:max-w-3xl">
        <ol className="sx-list">
          {view.rows.map(({ game, differsNote, chips, nonLeague }) => {
            const display = describeGame(game);
            const isTime = statusLabelIsTime(game, display.statusLabel);
            return (
              <li key={game.contestId}>
                <div
                  className={[
                    'relative grid min-h-row-1 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 px-gutter py-2 text-meta',
                    nonLeague ? 'sx-nonleague' : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="sr-only">{display.sentence}</span>
                  {/* Two FIXED slots, as GameRow's lead has three: the clock or the status (24px,
                      room for SCORE NOT REPORTED's two 12px caps lines — 135px will not fit the
                      104px column on one), then the chips (20px, reserved when there are none).
                      44px in all, against the 42px of the two names, so every row is 60px. The
                      status and the chips had shared one wrapping column, so FINAL + SCVAL was two
                      lines, FINAL + NL one and SCORE NOT REPORTED + SCVAL three: 58, 60 and 70px
                      rows in one list. */}
                  <span className="flex min-w-0 flex-col" aria-hidden="true">
                    <span className="flex min-h-6 items-center">
                      {isTime ? (
                        <span className="sx-num whitespace-nowrap text-cell text-ink-2">
                          {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
                        </span>
                      ) : (
                        <StatusLabel display={display} showChips={false} className="leading-3" />
                      )}
                    </span>
                    <span className="flex min-h-5 items-center">
                      {chips ? <GameChips display={display} /> : null}
                    </span>
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
