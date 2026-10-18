/**
 * The third-party source URLs the site and the cron share: the MaxPreps bases every MaxPreps URL is built
 * on, and the section-wide deep links the site credits. An import-free leaf (client modules reach it
 * through lib/config/season.ts); season-specific URLs (the bootstrap page, the CCS bracket) stay in
 * lib/config/season.ts, built on these bases.
 */

export const MAXPREPS_API = 'https://production.api.maxpreps.com';
export const MAXPREPS_WEB = 'https://www.maxpreps.com';

/** Section-wide deep links rendered by the Attribution component. League links live in lib/config/leagues.ts. */
export const SOURCE_LINKS = {
  maxpreps: `${MAXPREPS_WEB}/ca/field-hockey/`,
  sblive: 'https://www.si.com/high-school/stats/california/field-hockey',
  ccs: 'https://cifccs.org/sports/fh/index',
  ccsCalendar: 'https://cifccs.org/calendar/Field_Hockey?print=ical',
  cifss: 'https://www.cifsshome.org/widget/schedule-score',
} as const;
