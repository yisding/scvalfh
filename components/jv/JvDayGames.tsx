import { JV_SCHEDULE_TAG, JvFootnote } from './TeamJvGames';
import type { JvListSummary, JvRowView } from './jv-view';
import { GameStatus, SideCrest, lostAttr, rowState, wonAttr } from '../game-row/summary';
import { describeGame, type GameDisplay, type SideView } from '../ui/describe-game';
import { WIDE_SCORES } from '../words/score-words';

/**
 * A day's JV games: the site's one game row (`.sx-game`: the status slot, away over home with their
 * logos, the scores flush right) under the varsity slate and never mixed into it. The rows are not
 * links: a JV game has no page of its own. The note under the names says what the game is: its
 * league's name for a JV league game, `Non-league` for one that is not (lib/jv/jv-standings.ts),
 * nothing for a same-division game no varsity game matched (it counts nowhere and we do not
 * guess), `League schedule` for a game listed from the league's own schedule, and one sentence
 * when si.com reports a different score. A score from si.com carries the † in the status slot.
 */
export function JvDayGames({ view }: { view: JvListSummary & { rows: JvRowView[] } }) {
  return (
    <>
      <JvGameList rows={view.rows} />
      <JvFootnote summary={view} />
    </>
  );
}

function Side({ side, which, decided, showScore }: { side: SideView; which: 'away' | 'home'; decided: boolean; showScore: boolean }) {
  const won = decided ? wonAttr(side) : undefined;
  const lost = decided ? lostAttr(side) : undefined;
  return (
    <>
      <span className="sx-game-team sx-pinnable" data-side={which} data-team-slug={side.slug ?? undefined} data-won={won} data-lost={lost}>
        <SideCrest side={side} />
        <span className="sx-game-name">{side.shortName}</span>
        {side.slug ? (
          <span className="sx-pin-note" hidden>
            Your team
          </span>
        ) : null}
      </span>
      {showScore ? (
        <span data-side={which} data-won={won} data-lost={lost} className="sx-num sx-game-score text-score">
          <span>{side.glyph}</span>
        </span>
      ) : null}
    </>
  );
}

/** What a JV game is, for its note line. */
function kindWords(display: GameDisplay, chips: boolean): string | null {
  if (!chips) return null;
  return display.postseasonTag ?? (display.isNonLeague ? 'Non-league' : display.leagueTag);
}

/** The rows alone, without the footnote: the /jv lists print one footnote under several days' rows. */
export function JvGameList({ rows, showDate = false }: { rows: readonly JvRowView[]; showDate?: boolean }) {
  return (
    <div className="sx-gamelist">
      <ul className={WIDE_SCORES ? 'sx-games sx-games-wide' : 'sx-games'}>
        {rows.map(({ game, differsNote, chips, fromSchedule }) => {
          const display = describeGame(game);
          const state = rowState(game, display);
          const decided = state === 'final';
          const showScore = display.showScores && display.away.hasScore && display.home.hasScore;
          const note = [kindWords(display, chips), fromSchedule ? JV_SCHEDULE_TAG.text : null, differsNote]
            .filter(Boolean)
            .join(', ');
          return (
            <li
              key={game.contestId}
              className="sx-game"
              data-state={state}
              data-off={state === 'off' && display.kind !== 'unreported' ? '' : undefined}
            >
              <div className="sx-game-grid">
                <span className="sr-only">
                  {display.sentence}
                  {fromSchedule ? ` ${JV_SCHEDULE_TAG.label}` : ''}
                </span>
                <GameStatus game={game} display={display} showDate={showDate} />
                <span className="contents" aria-hidden="true">
                  <Side side={display.away} which="away" decided={decided} showScore={showScore} />
                  <Side side={display.home} which="home" decided={decided} showScore={showScore} />
                </span>
                {note ? <span className="sx-game-note whitespace-normal">{note}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default JvDayGames;
