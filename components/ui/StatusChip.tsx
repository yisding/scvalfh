/**
 * A postseason status in words ("Automatic qualifier", "At-large consideration or no automatic
 * berth"): plain text in the `.sx-status` face (DESIGN §33). Used by /playoffs, the /standings
 * status list and the team page's playoff line.
 */
export interface StatusChipProps {
  children: React.ReactNode;
  /** @deprecated Ignored: the status is plain text. */
  tone?: 'accent' | 'neutral';
  className?: string;
}

export function StatusChip({ children, className }: StatusChipProps) {
  // Plain text (DESIGN §33): a status is a few words, not a filled chip. `tone` is accepted and ignored.
  return <span className={['sx-status', className].filter(Boolean).join(' ')}>{children}</span>;
}

export default StatusChip;
