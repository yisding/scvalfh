import type { LiveBracketDivision } from '../../lib/postseason/sds-bracket';
import { SEASON_CALENDAR_YEAR } from '../../lib/season';
import { BracketView } from '../history/HistoryBracket';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';

import { sdsBracketIntro, sdsBracketView } from './sds-bracket-view';

/**
 * The San Diego Section's brackets on /playoffs (`#sds-bracket`, the first thing in the SoCal block once
 * they exist: spec §5.6, bracket-first).
 *
 * Drawn only from the Section's PUBLISHED bracket (data/sds-brackets-2026.json, transcribed from its
 * Championship Brackets sheet after the seeding meeting; lib/postseason/sds-bracket.ts joins MaxPreps' results
 * to it). The site still projects no place, and while the file is the placeholder the page never renders
 * this component.
 *
 * Each division is a section under its own h2 ('Open Division', 'Division I', 'Division II', the field's
 * size beside it) drawn by the shared drawer (components/history/HistoryBracket.tsx BracketView →
 * components/playoffs/Bracket.tsx), then one line under the last: where the brackets come from, the day
 * they were read, the sheet's link. The words are components/playoffs/sds-bracket-view.ts's: bare
 * numerals, never a seed word (scripts/copy-rules.ts SEED_CLAIM covers every San Diego surface), no
 * "eliminat", no champion named, no CCS word. A server component: it reads the registry and must stay
 * out of any client bundle (tests/ui/client-boundary.test.ts).
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
      {divisions.map((division, index) => {
        const view = sdsBracketView(division, today);
        return (
          <section key={view.id} aria-label={view.label} data-first={index === 0 ? '' : undefined} className="sx-section min-w-0">
            <SectionHeader kicker={view.label} meta={`${view.size} teams`} />
            <BracketView division={view} label={`${view.label} bracket`} anchorPrefix="sds-" />
          </section>
        );
      })}
      <p className="sx-note">
        {sdsBracketIntro(SEASON_CALENDAR_YEAR, source.retrievedOn)}{' '}
        <ExternalLink href={source.url}>{source.label}</ExternalLink>
      </p>
    </section>
  );
}

export default SdsBracket;
