'use client';

import { setLeague, useEffectiveLeague } from '../ui/use-league';
import type { LeagueId } from '../../lib/types';

/**
 * `Show <SHORT> here` on a league card (SPEC §8.2 write 2, §10.1).
 *
 * One of the three things allowed to write the remembered league. It is `sx-js-only` (hidden
 * without JavaScript, where the card's plain `<SHORT> standings →` link is the way on) and
 * `disabled` until hydrated, because a tap before hydration would do nothing. The write swaps the
 * home panels through `<html data-league>` and moves focus to the league panel's heading
 * (`focus: 'panel'`), so a keyboard user is never dropped on `<body>` when "Find your team" hides.
 */
export interface SetLeagueButtonProps {
  leagueId: LeagueId;
  shortName: string;
  className?: string;
}

export function SetLeagueButton({ leagueId, shortName, className }: SetLeagueButtonProps) {
  const { ready } = useEffectiveLeague();
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => setLeague(leagueId, { focus: 'panel' })}
      className={`sx-js-only sx-pill min-h-11 font-semibold disabled:opacity-60${className ? ` ${className}` : ''}`}
    >
      Show {shortName} here
    </button>
  );
}

export default SetLeagueButton;
