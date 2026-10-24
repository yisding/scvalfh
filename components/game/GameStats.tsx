import SectionHeader from '../ui/SectionHeader';
import { StatsTable } from '../teams/TeamPlayerStats';

import type { GameModel } from './game-view';
import { buildGameStatsView, type BoxScoreLookup } from './game-stats-view';

/**
 * GAME STATS — each followed side's box score for this game, as its coach entered it on MaxPreps
 * (components/game/game-stats-view.ts says what is shown and why). Renders nothing for a game with
 * no entries, so the page's grid row collapses (app/game/[id]/page.tsx).
 *
 * The tables are the team page's (components/teams/TeamPlayerStats.tsx StatsTable): at most five
 * numeric columns, so they fit 320px without a scroller (DESIGN §10.8), each head an abbreviation
 * a screen reader hears in full and the legend spells out. The two sides sit side by side from
 * 768px, away first, like the scoreboard.
 */
export interface GameStatsProps {
  model: GameModel;
  className?: string;
  /** Where the box scores come from; data/player-stats.json unless a test passes its own. */
  lookup?: BoxScoreLookup;
}

export function GameStats({ model, className, lookup }: GameStatsProps) {
  const view = buildGameStatsView(model, lookup);
  if (!view) return null;

  return (
    <section className={className} aria-labelledby="game-stats-kicker">
      <SectionHeader kicker="Game stats" as="h2" id="game-stats-kicker" meta="As entered on MaxPreps" />
      <div className="grid gap-6 md:grid-cols-2 md:gap-x-6">
        {view.sides.map((side) => (
          <div key={side.key} className="min-w-0">
            <SectionHeader as="h3" kicker={side.name} />
            {side.scoring ? (
              <StatsTable table={side.scoring} caption={`${side.name} scoring in this game`} />
            ) : null}
            {side.goalies ? (
              <div className={side.scoring ? 'mt-3' : undefined}>
                <StatsTable
                  table={side.goalies}
                  caption={`${side.name} goalkeeping in this game`}
                  rowHeader="Goalkeeper"
                />
              </div>
            ) : null}
            {!side.entered ? (
              <p className="m-0 text-meta text-ink-3">No stats entered on MaxPreps for this game.</p>
            ) : !side.scoring && !side.goalies ? (
              <p className="m-0 text-meta text-ink-3">No goals, assists or saves entered for this game.</p>
            ) : null}
            {side.notes.map((note) => (
              <p key={note} className="mt-2 mb-0 text-meta text-ink-2">
                {note}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 max-w-prose text-meta text-ink-3">
        <p className="m-0">
          Each coach&rsquo;s own entries for this game on MaxPreps. A dash is a stat the coach tracked in
          this game but entered nothing for.
        </p>
        {view.legend.length > 0 ? <p className="mt-1 mb-0">{view.legend.join(' · ')}.</p> : null}
      </div>
    </section>
  );
}

export default GameStats;
