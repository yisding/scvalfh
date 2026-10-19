/**
 * The third-party source URLs the site and the cron share: the MaxPreps and si.com (SBLive) bases every
 * URL to those sites is built on, and the section-wide deep links the site credits. An import-free leaf (client modules reach it
 * through lib/config/season.ts); season-specific URLs (the bootstrap page, the CCS bracket) stay in
 * lib/config/season.ts, built on these bases.
 */

export const MAXPREPS_API = 'https://production.api.maxpreps.com';
export const MAXPREPS_WEB = 'https://www.maxpreps.com';
/** si.com's California field hockey stats root (SBLive): team pages, the scoreboard and the standings hang off it. */
export const SBLIVE_WEB = 'https://www.si.com/high-school/stats/california/field-hockey';

/** Section-wide deep links rendered by the Attribution component. League links live in lib/config/leagues.ts. */
export const SOURCE_LINKS = {
  maxpreps: `${MAXPREPS_WEB}/ca/field-hockey/`,
  sblive: SBLIVE_WEB,
  ccs: 'https://cifccs.org/sports/fh/index',
  ccsCalendar: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  cifss: 'https://www.cifsshome.org/widget/schedule-score',
} as const;
