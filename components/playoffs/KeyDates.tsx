import DateList from './DateList';
import { ccsHostingSentence, keyDateRows, type LeagueKeyDate } from './playoff-view';
import type { CcsKeyDates } from '../../lib/types';

/**
 * Every published CCS key date, plus each CCS league's own postseason date (the SCVAL crossover and
 * 4th-place play-in, the BVAL play-in), as ONE chronological plain list (DateList). A league date
 * carries its league's short name after its title, so nobody reads the BVAL play-in as a CCS round.
 * The round dates are semibold so the tournament's own dates stand out from the administrative ones;
 * a date already past (against `today`) is grey.
 *
 * Times are printed only where the source gives one (entries due 12:00 PM, seeding meeting 1:00 PM,
 * evaluation meeting 4:00 PM, the BVAL play-in 11 AM); the round dates are all-day in the CCS feed
 * and are not given an invented start time. Every date is a `<time datetime>` and every clock time
 * is labelled PT (DESIGN §10.11).
 */
export interface KeyDatesProps {
  keyDates: CcsKeyDates;
  /** League-owned dates from config pairings (crossover, play-in). */
  leagueDates?: readonly LeagueKeyDate[];
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  /** true once the page draws a CCS bracket: the seeding meeting is over. */
  seeded?: boolean;
  /** getToday(): a date before it is drawn grey. */
  today?: string;
  className?: string;
}

export function KeyDates({ keyDates, leagueDates = [], confirmed, seeded = false, today, className }: KeyDatesProps) {
  const rows = keyDateRows(keyDates, leagueDates, undefined, seeded);

  return (
    <div className={className}>
      <DateList rows={rows} today={today} />
      {/* Who hosts comes from config (CCS.highSeedHostsThrough), worded by ccsHostingSentence, so the footer can
          never contradict the calendar the page cites. The calendar carries the entries deadline, the three rounds
          and the evaluation meeting, not the seeding meeting or the end of league play, so "corroborated" names
          exactly those. */}
      <p className="sx-note">
        {ccsHostingSentence()}{' '}
        {confirmed
          ? 'The entries deadline, the three round dates and their sites above are corroborated by that calendar; league dates come from the official league schedules.'
          : 'Dates from the CIF-CCS playoff-dates release and the official league schedules. All times Pacific.'}
      </p>
    </div>
  );
}

export default KeyDates;
