/**
 * @deprecated Plain text (DESIGN §33): `.sx-flag` is the 14px status face with no fill and no box.
 * Kept as an export until the pages stop importing it.
 */
export interface FlagProps {
  children: React.ReactNode;
  className?: string;
}

export function Flag({ children, className }: FlagProps) {
  return <span className={['sx-flag', className].filter(Boolean).join(' ')}>{children}</span>;
}

export default Flag;
