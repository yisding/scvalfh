/**
 * The notes a MaxPreps ↔ cifsshome.org report row carries (docs/DATA-SOURCES.md §1.2a). They are copy:
 * lib/pipeline/reconcile/cifss-crosscheck.ts stamps them onto the rows it builds, and
 * components/about/CifssCrossCheckSummary.tsx prints `notOnMaxPreps` once as the shared note, so both read the
 * words from here. Import-free on purpose: the about page's component must not pull the reconciliation in.
 */
export const CIFSS_NOTES = {
  pending: 'MaxPreps lists the game with no score yet, so it stays unreported here.',
  postponed: 'MaxPreps lists the game as postponed, so it stays unreported here.',
  notOnMaxPreps:
    'MaxPreps has no game between these teams within three days of this date. Schools enter their own rows on cifsshome.org, so this may be a scrimmage or a game played on another date; nothing is published from it.',
} as const;
