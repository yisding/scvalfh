import Link from 'next/link';

import { shortDate } from '../../lib/format';
import type { PlayoffKeyDates, SeasonPhase } from '../../lib/types';

/**
 * The one sentence at the top of the home page that says where the season is (DESIGN §8).
 *
 * The house rule is "say what is true, say when it changes", so every phase names a real date from
 * the snapshot or the by-laws, and the noisiest case in the whole calendar — the Aug 21 to Sep 8
 * window, when the standings tables are legitimately empty while dozens of non-league games have
 * been played — gets a full sentence rather than a confusing blank table. In the ordinary middle of
 * the league season this renders NOTHING, because the fold is worth more than a banner.
 */
export interface PhaseLeadProps {
  phase: SeasonPhase;
  today: string;
  /** 'YYYY-MM-DD' of the first contest and the first league contest. */
  firstGame: string | null;
  firstLeagueGame: string | null;
  /** Non-league games already played, for the pre-league-play sentence. */
  nonLeagueFinals: number;
  crossoverDate: string;
  keyDates: PlayoffKeyDates;
  className?: string;
}

function Banner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`mt-0 mb-6 max-w-[62ch] rounded-card border border-hairline bg-surface-2 px-gutter py-3 text-meta text-ink-2${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </p>
  );
}

export function PhaseLead({
  phase,
  today,
  firstGame,
  firstLeagueGame,
  nonLeagueFinals,
  crossoverDate,
  keyDates,
  className,
}: PhaseLeadProps) {
  if (phase === 'preseason') {
    return (
      <Banner className={className}>
        <span className="font-semibold text-ink">
          {firstGame ? `The season starts ${shortDate(firstGame)}.` : 'The season has not started.'}
        </span>{' '}
        {firstLeagueGame ? `League play begins ${shortDate(firstLeagueGame)}. ` : ''}
        No games have been played, so every record below is empty on purpose.{' '}
        <Link href="/schedule" className="text-accent hover:underline">
          Full schedule <span aria-hidden="true">&rarr;</span>
        </Link>
      </Banner>
    );
  }

  if (phase === 'regular' && firstLeagueGame && today < firstLeagueGame) {
    return (
      <Banner className={className}>
        <span className="font-semibold text-ink">
          League play starts {shortDate(firstLeagueGame)}.
        </span>{' '}
        These tables count league games only, so the {nonLeagueFinals} non-league{' '}
        {nonLeagueFinals === 1 ? 'game' : 'games'} played so far{' '}
        {nonLeagueFinals === 1 ? 'is' : 'are'} on the schedule and in the overall records, not in the
        standings.{' '}
        <Link href="/schedule" className="text-accent hover:underline">
          Full schedule <span aria-hidden="true">&rarr;</span>
        </Link>
      </Banner>
    );
  }

  if (phase === 'crossover') {
    return (
      <Banner className={className}>
        <span className="font-semibold text-ink">League play is over.</span> The crossover games and
        the fourth-place play-in for SCVAL&rsquo;s seventh automatic CCS berth are{' '}
        {shortDate(crossoverDate)}; the CCS seeding meeting is {shortDate(keyDates.seedingMeeting)}.{' '}
        <Link href="/playoffs" className="text-accent hover:underline">
          Who is in <span aria-hidden="true">&rarr;</span>
        </Link>
      </Banner>
    );
  }

  if (phase === 'playoffs') {
    return (
      <Banner className={className}>
        <span className="font-semibold text-ink">The CCS tournament is under way.</span>{' '}
        Quarterfinals {shortDate(keyDates.quarterfinals)}, semifinals{' '}
        {shortDate(keyDates.semifinals)}, final {shortDate(keyDates.finals)}. League standings below
        are final.{' '}
        <Link href="/playoffs" className="text-accent hover:underline">
          Bracket <span aria-hidden="true">&rarr;</span>
        </Link>
      </Banner>
    );
  }

  if (phase === 'complete') {
    return (
      <Banner className={className}>
        <span className="font-semibold text-ink">The season is over.</span> The tables below are the
        final league standings.{' '}
        <Link href="/history/2025-26" className="text-accent hover:underline">
          Last season <span aria-hidden="true">&rarr;</span>
        </Link>
      </Banner>
    );
  }

  return null;
}

export default PhaseLead;
