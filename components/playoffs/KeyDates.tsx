import DateList from './DateList';
import { ccsHostingSentence, keyDateRows, type LeagueKeyDate } from './playoff-view';
import type { CcsKeyDates } from '../../lib/types';

/**
 * Every published CCS key date, plus each CCS league's own postseason date (the SCVAL crossover and
 * 4th-place play-in, the BVAL play-in), as ONE chronological list in a card (brief §5.8). A league
 * date carries its league's short name as a label, so nobody reads the BVAL play-in as a CCS round.
 * The three round dates (quarterfinals, semifinals, final) are set in ink and semibold so the
 * tournament's own dates stand out from the administrative ones; nothing is printed twice and
 * nothing is dropped. The league label FOLLOWS the title, so every title starts at the same x
 * whatever the label's width (or with none).
 *
 * Times are printed only where the source gives one (entries due 12:00 PM, seeding meeting 1:00 PM,
 * evaluation meeting 4:00 PM, the BVAL play-in 11 AM); the round dates are all-day in the CCS feed
 * and are not given an invented start time. A time sits UNDER its date in the date column (88px
 * on a phone, where "12:00 PM PT" is 86px of 13px mono; 104px from md, so it no longer crowds the
 * title), not after the title, where it pushed "CCS seeding meeting 1:00 PM PT" onto two lines at
 * 390. Every date is a `<time datetime>` and every clock time is labelled PT (DESIGN §10.11).
 *
 * On a phone the card is a full-bleed band (`sx-bleed`) and each row takes the 16px gutter as its
 * own padding, the same as every other row list on the site; from md it is a card again.
 */
export interface KeyDatesProps {
  keyDates: CcsKeyDates;
  /** League-owned dates from config pairings (crossover, play-in). */
  leagueDates?: readonly LeagueKeyDate[];
  /** true once the CCS iCal feed has corroborated the dates; undefined before the Oct 25 gate. */
  confirmed?: boolean;
  className?: string;
}

export function KeyDates({ keyDates, leagueDates = [], confirmed, className }: KeyDatesProps) {
  const rows = keyDateRows(keyDates, leagueDates);

  return (
    <div className={className}>
      <DateList rows={rows} />
      {/* Who hosts comes from config (CCS.highSeedHostsThrough), worded by ccsHostingSentence, so the footer can
          never contradict the calendar the page cites. The calendar carries the entries deadline, the three rounds
          and the evaluation meeting, not the seeding meeting or the end of league play, so "corroborated" names
          exactly those. */}
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-2">
        {ccsHostingSentence()}{' '}
        {confirmed
          ? 'The entries deadline, the three round dates and their sites above are corroborated by that calendar; league dates come from the official league schedules.'
          : 'Dates from the CIF-CCS playoff-dates release and the official league schedules. All times Pacific.'}
      </p>
    </div>
  );
}

export default KeyDates;
