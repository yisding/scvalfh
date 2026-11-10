import { JV_SCHEDULE_TAG, JvFootnote } from './TeamJvGames';
import Tag from '../ui/Tag';
import type { JvListSummary, JvRowView } from './jv-view';
import { clockText, describeGame, statusLabelIsTime, type SideView } from '../ui/describe-game';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import StatusLabel, { GameChips } from '../ui/StatusLabel';

/**
 * A day page's JV games: one compact card, a row per game — the time (or the status once there
 * is one), then the away and home school each with its score — under the varsity slate and never
 * mixed into it. Rows are not links: a JV game has no page of its own. A JV league game carries
 * its league chip and a non-league one the NL chip and rule (lib/jv/jv-standings.ts); a same-division
 * game no varsity game matched carries neither. A score from si.com carries the † (StatusLabel), and
 * a MaxPreps score si.com reports differently gets one line under its row.
 */
export function JvDayGames({ view }: { view: JvListSummary & { rows: JvRowView[] } }) {
  return (
    <>
      <JvGameList rows={view.rows} />
      <JvFootnote summary={view} />
    </>
  );
}

/** The card of rows alone, without the footnote: the /jv lists print one footnote under several days' cards. */
export function JvGameList({ rows }: { rows: readonly JvRowView[] }) {
  return (
      <div className="sx-card sx-flush sx-bleed md:max-w-3xl">
        <ol className="sx-list">
          {rows.map(({ game, differsNote, chips, nonLeague, fromSchedule }) => {
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
                  <span className="sr-only">
                    {display.sentence}
                    {fromSchedule ? ` ${JV_SCHEDULE_TAG.label}` : ''}
                  </span>
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
                          {clockText(game, 'TBA')}
                        </span>
                      ) : (
                        <StatusLabel display={display} showChips={false} className="leading-3" />
                      )}
                    </span>
                    <span className="flex min-h-5 items-center">
                      {chips ? <GameChips display={display} /> : null}
                      {fromSchedule ? <Tag className={chips ? 'ml-1' : undefined}>{JV_SCHEDULE_TAG.text}</Tag> : null}
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
