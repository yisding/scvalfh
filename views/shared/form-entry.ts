/**
 * One chip of a form strip (components/ui/FormStrip.tsx renders it; DESIGN §5.5, R-7): the view
 * models build these (views/teams/team-view.ts, views/game/game-view.ts) and the standings table
 * adapts `standing.computed.last5` with FormStrip's `toFormEntries`. The type lives with the views
 * so a view model never imports a component.
 */
import type { Outcome } from '@/lib/model/game';

export interface FormEntry {
  outcome: Outcome;
  /** Links the chip to the game page (`gameHref(contestId)`) when the caller has it. */
  contestId?: string;
  opponent?: string;
  score?: string;
  date?: string;
}
