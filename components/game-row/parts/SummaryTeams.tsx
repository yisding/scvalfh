import type { LeagueId } from '@/lib/model/ids';
import type { GameDisplay } from '@/views/shared/game-display-client';
import type { GameRecords } from '@/views/shared/game-records';

import { TeamLine } from './TeamLine';

/**
 * The two team lines of a summary row, away over home (GameRow, Home's ResultRow). 24px each,
 * 4px apart: the 52px block SummaryLead's slots are measured against.
 */
export function SummaryTeams({
  display,
  records = null,
  scopeLeague = null,
  monogram = true,
}: {
  display: GameDisplay;
  /** The records to print (already gated by the row: `printedRecords`). */
  records?: GameRecords | null;
  scopeLeague?: LeagueId | null;
  monogram?: boolean;
}) {
  return (
    <span className="min-w-0 space-y-1" aria-hidden="true">
      <TeamLine
        side={display.away}
        showScore={display.showScores}
        monogram={monogram}
        record={records?.away ?? null}
        scopeLeague={scopeLeague}
      />
      <TeamLine
        side={display.home}
        showScore={display.showScores}
        monogram={monogram}
        record={records?.home ?? null}
        scopeLeague={scopeLeague}
      />
    </span>
  );
}

export default SummaryTeams;
