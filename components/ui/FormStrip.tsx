import Link from 'next/link';

import { OUTCOME_WORDS } from '../../lib/format';
import type { Outcome } from '../../lib/types';

import ResultChip, { CHIP_LABEL } from './ResultChip';

/**
 * Last FIVE league results everywhere — phone, desktop, home mini-table, team page. No context
 * shows a different window (DESIGN §5.5, R-7).
 *
 * Oldest → newest, left to right, with the direction stated in words once per page. Unreported
 * and cancelled games are SKIPPED upstream, not shown as dots: a placeholder square would read as
 * a result. Fewer than five games renders only what exists; zero games renders the words
 * "no results" rather than an empty row of boxes.
 *
 * Screen readers get ONE sentence for the whole strip (DESIGN §10.6), never five letters. When
 * the caller supplies contestIds the chips are also links, each with its own label, so both
 * §5.5's sentence and §7.6's per-chip label are present.
 *
 * A LINKED chip is a tap target and is sized like one: a 40px box with an 8px gap, which is
 * DESIGN §4.4's own rule for chip links. The UNLINKED strip (the standings row, whose five chips
 * are measured into the phone row's line 2 and are not targets at all) keeps a 4px surface gap:
 * five 20px chips and four gaps are 116px, which still fits beside "10-1-0 overall" at 320px. The two readings of §7.6 cannot both hold for a link: 20×20 marks two pixels apart fail
 * WCAG 2.5.8 outright (axe: "safe clickable space has a diameter of 20px instead of at least
 * 24px"), and §10.9 makes a clean axe run a gate. So the gap widens exactly where the chip
 * becomes something you aim a thumb at, and nowhere else.
 */
export interface FormEntry {
  outcome: Outcome;
  /** Links the chip to /game/[contestId] when the caller has it. */
  contestId?: string;
  opponent?: string;
  score?: string;
  date?: string;
}

export interface FormStripProps {
  /** Oldest → newest, league only, at most 5. */
  entries: FormEntry[];
  /** 20 everywhere a strip is visible; 16 (10px letters) is kept for compatibility only. */
  size?: 16 | 20 | 24;
  /** Renders the "oldest → newest" caption; do it once per page. */
  showDirection?: boolean;
  /** "Homestead last 5 league games" — the subject of the strip's one sentence. */
  label: string;
  /** Renders "+ 3 non-league" as a caption (DESIGN §5.5). */
  nonLeagueCount?: number;
  className?: string;
}

/** DESIGN §4.4: a chip LINK is a 40px target with an 8px gap. An unlinked mark is 4px apart. */
const TAP = 40;
const TAP_GAP = 8;
const MARK_GAP = 4;

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

export function FormStrip({
  entries,
  size = 20,
  showDirection = false,
  label,
  nonLeagueCount,
  className,
}: FormStripProps) {
  if (entries.length === 0) {
    return (
      <span className={`text-meta text-ink-3${className ? ` ${className}` : ''}`}>no results</span>
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
    <span className={`inline-flex flex-wrap items-center gap-2${className ? ` ${className}` : ''}`}>
      <span className="sr-only">{sentence} Most recent last.</span>
      <span className="inline-flex items-center" aria-hidden={linked ? undefined : 'true'}>
        {entries.map((entry, i) => {
          // The newest chip carries a 2px ink underline as well as its position. It hugs the
          // MARK, not the tap box, so widening the box does not widen the underline.
          // Only the newest mark has a border at all; the others take the same 4px as padding.
          // A `transparent` border is NOT invisible under forced colours: the UA repaints every
          // border colour as CanvasText, so the old "2px solid transparent" spacer drew an
          // underline under all five chips there and the newest one was no longer singled out.
          // Normal rendering is pixel-identical (2 + 2 vs 4 below each chip).
          const newest = i === entries.length - 1;
          const mark = (
            <span
              className="inline-flex"
              style={
                newest
                  ? { paddingBottom: 2, borderBottom: '2px solid var(--sx-text)' }
                  : { paddingBottom: 4 }
              }
            >
              <ResultChip kind={entry.outcome} size={size} />
            </span>
          );
          return (
            <span
              key={`${entry.contestId ?? 'form'}-${i}`}
              className="inline-flex"
              // 4px of surface between marks; 8px between targets (DESIGN §4.4).
              style={{ marginLeft: i === 0 ? 0 : linked ? TAP_GAP : MARK_GAP }}
            >
              {entry.contestId ? (
                <Link
                  href={`/game/${entry.contestId}`}
                  prefetch={false}
                  aria-label={chipLabel(entry)}
                  className="inline-flex items-center justify-center"
                  style={{ width: TAP, height: TAP }}
                >
                  {/* The link's own label is the accessible name; the chip's role="img" would
                      otherwise be announced a second time inside it. */}
                  <span aria-hidden="true" className="inline-flex">
                    {mark}
                  </span>
                </Link>
              ) : (
                mark
              )}
            </span>
          );
        })}
      </span>
      {showDirection ? (
        <span className="text-micro font-medium text-ink-3">Oldest &rarr; newest</span>
      ) : null}
      {nonLeagueCount ? (
        <span className="text-meta text-ink-3">+ {nonLeagueCount} non-league</span>
      ) : null}
    </span>
  );
}

export default FormStrip;
