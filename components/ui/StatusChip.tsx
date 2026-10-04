/**
 * The postseason status chip: one tinted capsule in 12px SANS, sentence case ("Automatic
 * qualifier", "At-large consideration or no automatic path"). It is the sentence-case sibling of
 * `Tag`: a status is a phrase, and mono caps are kept for the 1–2 word codes a Tag is for
 * (brief §1, DESIGN §7.16), so this is a component of its own rather than a mode of Tag.
 *
 * The tones are Tag's pairs: `accent` is accent-ink on the accent wash (6.5 / 7.55), only for an
 * automatic qualifier, where the accent already means "berth"; `neutral` is ink-2 on surface-3.
 * The capsule is `inline-block`, so a long phrase grows into ONE taller capsule instead of
 * breaking into a cloned pill per line.
 *
 * Used by /playoffs (PlayoffProjection), the /standings band (PlayoffStatusBand) and the team
 * page's playoff line (TeamPlayoffLine), so the three are one height.
 */
export interface StatusChipProps {
  children: React.ReactNode;
  /** `accent` only for an automatic qualifier. */
  tone: 'accent' | 'neutral';
  className?: string;
}

export function StatusChip({ children, tone, className }: StatusChipProps) {
  return (
    <span
      className={[
        'inline-block max-w-full rounded-tag px-2 py-0.5 text-micro font-semibold leading-5',
        tone === 'accent' ? 'bg-accent-wash text-accent-ink' : 'bg-surface-3 text-ink-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

export default StatusChip;
