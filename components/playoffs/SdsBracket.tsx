import type { LiveBracketDivision } from '../../lib/sds-bracket';
import { SEASON_CALENDAR_YEAR } from '../../lib/season';
import { BracketView } from '../history/HistoryBracket';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import { sdsBracketIntro, sdsBracketView } from './sds-bracket-view';

/**
 * The San Diego Section's brackets on /playoffs (`#sds-bracket`, inside the `#sds-playoffs` block, between its
 * "Round dates" list and the three conference cards; plan final-08, 2026-10-30).
 *
 * Drawn only from the Section's PUBLISHED bracket (data/sds-brackets-2026.json, transcribed from its
 * Championship Brackets sheet after the Sat Oct 31 seeding meeting; lib/sds-bracket.ts joins MaxPreps' results
 * to it). This reverses DESIGN §24.8's "no San Diego bracket" for that case only: the site still projects no
 * place, and while the file is the placeholder the page never renders this component, so nothing is drawn and
 * /playoffs weighs what it did.
 *
 * One sentence above (where the brackets come from, the day they were read, the sheet's link), then each
 * division under its own h3 ('Open Division', 'Division I', 'Division II') with the archive's drawer
 * (components/history/HistoryBracket.tsx BracketView): rounds stacked on a phone, round columns from md (lg for
 * four or five rounds), the winner's line 600 weight with the 2px rule, one sentence per card for a screen reader,
 * a joined card one link to its game page. The words are components/playoffs/sds-bracket-view.ts's: bare
 * numerals, never a seed word (scripts/copy-rules.ts SEED_CLAIM covers every San Diego surface), no "eliminat",
 * no champion named, no CCS word. A server component: it reads the registry and must stay out of any client
 * bundle (tests/ui/client-boundary.test.ts).
 */
export interface SdsBracketProps {
  divisions: readonly LiveBracketDivision[];
  source: { label: string; url: string; retrievedOn: string };
  /** getToday(): a card whose day has passed with no result says so. */
  today: string;
  className?: string;
}

export function SdsBracket({ divisions, source, today, className }: SdsBracketProps) {
  if (divisions.length === 0) return null;
  return (
    <section id="sds-bracket" aria-label="The Section’s brackets" className={className}>
      <p className="m-0 max-w-prose text-body text-ink-2">
        {sdsBracketIntro(SEASON_CALENDAR_YEAR, source.retrievedOn)}{' '}
        <ExternalLink href={source.url} className="sx-action gap-1">
          {source.label}
        </ExternalLink>
      </p>
      {divisions.map((division) => {
        const view = sdsBracketView(division, today);
        return (
          <section key={view.id} aria-label={view.label} className="mt-section min-w-0">
            <SectionHeader as="h3" kicker={view.label} meta={`${view.size} teams`} className="mb-4" />
            <BracketView division={view} label={`${view.label} bracket`} />
          </section>
        );
      })}
    </section>
  );
}

export default SdsBracket;
