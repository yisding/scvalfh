/**
 * The IANA zone every date on the site is formatted in: an import-free leaf, so lib/format (which every
 * client module reaches) loads it without loading lib/season and the sport definition behind it, which
 * would add the sport's stat lines and rating constants to every page's first-load JS (assert:budgets).
 */
export const TIME_ZONE = 'America/Los_Angeles';
