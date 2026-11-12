import Link from 'next/link';

import { OUTCOME_WORDS } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Outcome } from '../../lib/types';

import ResultChip, { CHIP_LABEL } from './ResultChip';

/**
 * Last FIVE league results everywhere — phone, desktop, home mini-table, team page. No context
 * shows a different window (DESIGN §5.5, R-7).
 *
 * Oldest → newest, left to right. Unreported and cancelled games are SKIPPED upstream, not shown
 * as dots: a placeholder square would read as a result. Fewer than five games renders only what
 * exists; zero games renders the words "no results" rather than an empty row of boxes.
 *
 * The direction in words and the excluded-games caption (DESIGN §5.5) are the host's, not the
 * strip's: the team page states "League, oldest to newest" in its Form heading's meta and prints
 * "+ N other games, not counted here" as a line of its own (app/teams/[slug]/page.tsx), and the
 * game page's FormGoingIn heading says "League games · oldest → newest".
 *
 * Screen readers get ONE sentence for the whole strip (DESIGN §10.6), never five letters. When
 * the caller supplies contestIds the chips are also links, each with its own label, so both
 * §5.5's sentence and §7.6's per-chip label are present.
 *
 * A LINKED chip is a tap target and is sized like one: a 40px box with an 8px gap (DESIGN §4.4).
 * The UNLINKED strip (a standings row) is `.sx-form`: the chips 2px apart, no marker on the newest.
 */
export interface FormEntry {
  outcome: Outcome;
  /** Links the chip to the game page (`gameHref(contestId)`) when the caller has it. */
  contestId?: string;
  opponent?: string;
  score?: string;
  date?: string;
}

export interface FormStripProps {
  /** Oldest → newest, league only, at most 5. */
  entries: FormEntry[];
  /** 16 in every standings table (DESIGN §33); 20 on the game page; 24 on the team page. */
  size?: 16 | 20 | 24;
  /** "Homestead last 5 league games" — the subject of the strip's one sentence. */
  label: string;
  className?: string;
}

/** DESIGN §4.4: a chip LINK is a 40px target with an 8px gap. Unlinked marks are 2px apart (`.sx-form`). */
const TAP = 40;
const TAP_GAP = 8;

/** Standings carry outcomes only; this is the adapter for `standing.computed.last5`. */
export function toFormEntries(outcomes: readonly Outcome[]): FormEntry[] {
  return outcomes.map((outcome) => ({ outcome }));
}

function chipLabel(entry: FormEntry): string {
  const parts = [CHIP_LABEL[entry.outcome]];
  if (entry.score) parts.push(entry.score);
  if (entry.opponent) parts.push(`vs ${entry.opponent}`);
  if (entry.date) parts.push(entry.date);
  return parts.join(' ');
}

export function FormStrip({ entries, size = 20, label, className }: FormStripProps) {
  if (entries.length === 0) {
    return (
      <span className={['text-meta text-ink-2', className].filter(Boolean).join(' ')}>no results</span>
    );
  }
  const linked = entries.some((e) => e.contestId);
  // ONE sentence (DESIGN §10.6). The caller's `label` is already the subject ("Homestead last 4
  // league games"), so the words are appended to it directly; composing it with
  // `formStripLabel()`, which carries its own "Last 4 league games" subject, said it twice.
  const sentence = `${label}, oldest first: ${entries
    .map((e) => OUTCOME_WORDS[e.outcome])
    .join(', ')}.`;

  return (
    <span className={['inline-flex flex-wrap items-center gap-2', className].filter(Boolean).join(' ')}>
      <span className="sr-only">{sentence} Most recent last.</span>
      {/* `.sx-form`: the chips 2px apart. Position alone says which is newest; there is no marker. */}
      <span className="sx-form" style={linked ? { gap: TAP_GAP } : undefined} aria-hidden={linked ? undefined : 'true'}>
        {entries.map((entry, i) =>
          entry.contestId ? (
            <Link
              key={`${entry.contestId}-${i}`}
              href={gameHref(entry.contestId)}
              prefetch={false}
              aria-label={chipLabel(entry)}
              className="inline-flex items-center justify-center"
              style={{ width: TAP, height: TAP }}
            >
              {/* The link's own label is the accessible name; the chip's role="img" would
                  otherwise be announced a second time inside it. */}
              <span aria-hidden="true" className="inline-flex">
                <ResultChip kind={entry.outcome} size={size} />
              </span>
            </Link>
          ) : (
            <ResultChip key={`form-${i}`} kind={entry.outcome} size={size} />
          ),
        )}
      </span>
    </span>
  );
}

export default FormStrip;
