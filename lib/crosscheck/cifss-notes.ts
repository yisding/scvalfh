/**
 * The notes the cifsshome.org score cross-check writes on its rows (CifssOnlyRow.note, rendered
 * verbatim). A leaf with no imports: lib/crosscheck/cifss-crosscheck.ts writes them, and /about's
 * summary prints the shared `notOnMaxPreps` note once above its rows without loading the comparison,
 * the cifsshome.org scraper or the si.com join that compareCifss needs.
 */

export const CIFSS_NOTES = {
  pending: 'MaxPreps lists the game with no score yet, so it stays unreported here.',
  postponed: 'MaxPreps lists the game as postponed, so it stays unreported here.',
  notOnMaxPreps:
    'MaxPreps has no game between these teams within three days of this date. Schools enter their own rows on cifsshome.org, so this may be a scrimmage or a game played on another date; nothing is published from it.',
} as const;
