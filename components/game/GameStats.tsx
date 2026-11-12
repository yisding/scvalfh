import { getTeamPlayerStatsWithNotes } from '../../lib/players/player-stats';
import SectionHeader from '../ui/SectionHeader';
import { StatsTable } from '../teams/TeamPlayerStats';

import type { GameModel } from './game-view';
import { buildGameStatsView, type GameStatsLookup } from './game-stats-view';

/**
 * GAME STATS — each followed side's box score for this game, as its coach entered it on MaxPreps
 * (components/game/game-stats-view.ts says what is shown and why). Renders nothing for a game with
 * no table to show, so the page's grid row collapses (app/game/[id]/page.tsx).
 *
 * The tables are the team page's (components/teams/TeamPlayerStats.tsx StatsTable): at most five
 * numeric columns, so they fit 320px without a scroller (DESIGN §10.8), each head an abbreviation
 * a screen reader hears in full and the legend spells out. Each side's tables sit under a strip. The goalkeeping table's name column says
 * "Player", as every one does: coaches list field players in MaxPreps' goalkeeping table too. The
 * two sides sit side by side from 768px, away first, like the scoreboard. A row a game note added
 * to carries the team page's mark (an asterisk, "includes a game note" to a screen reader), and the
 * note itself is quoted under the tables.
 */
export interface GameStatsProps {
  model: GameModel;
  className?: string;
  /** Where the box scores come from; data/player-stats.json unless a test passes its own. */
  lookup?: GameStatsLookup;
}

export function GameStats({ model, className, lookup }: GameStatsProps) {
  const view = buildGameStatsView(model, lookup);
  if (!view) return null;

  return (
    <section className={className} aria-labelledby="game-stats-kicker">
      <SectionHeader kicker="Game stats" as="h2" id="game-stats-kicker" meta="As entered on MaxPreps" />
      <div className="sx-two gap-y-4">
        {view.sides.map((side) => (
          <div key={side.key} className="min-w-0">
            {/* `side.key` is the team's slug (game-stats-view.ts): every side here is a registry
                team, so its strip carries the route to that team's page — to its season stats
                when the team page has that section (it renders one exactly when the player-stats
                file has the team, app/teams/[slug]/page.tsx), else to the page itself. */}
            <SectionHeader
              strip
              kicker={side.name}
              action={
                getTeamPlayerStatsWithNotes(side.key)
                  ? { href: `/teams/${side.key}#player-stats`, label: 'Season stats' }
                  : { href: `/teams/${side.key}`, label: 'Team' }
              }
            />
            {side.scoring ? (
              <StatsTable table={side.scoring} caption={`${side.name} scoring in this game`} />
            ) : null}
            {side.goalies ? (
              <div className={side.scoring ? 'mt-3' : undefined}>
                <StatsTable table={side.goalies} caption={`${side.name} ${side.secondCaption ?? 'goalkeeping'} in this game`} />
              </div>
            ) : null}
            {side.empty ? <p className="sx-empty pt-2">{side.empty}</p> : null}
            {side.notes.map((note) => (
              <p key={note} className="sx-note">
                {note}
              </p>
            ))}
          </div>
        ))}
      </div>
      {view.notedFrom ? (
        <p className="sx-note">
          * Also counts what was written in MaxPreps&rsquo; note for this game but not entered as stats:
          &ldquo;{view.notedFrom}&rdquo;.
        </p>
      ) : null}
      {view.caveat ? <p className="sx-note">{view.caveat}</p> : null}
      {view.legend.length > 0 ? <p className="sx-note">{view.legend.join(', ')}.</p> : null}
    </section>
  );
}

export default GameStats;
