/**
 * The one filled label on the site (DESIGN §33): ink on the highlighter (`.sx-flag`, app/globals.css),
 * 11px caps. Only for "yours" and "live": `Your team`, `Live`. The fill is never the only cue: the
 * words say it. Everything else that used to be a chip is a text-only `Tag` or plain text.
 */
export interface FlagProps {
  children: React.ReactNode;
  className?: string;
}

export function Flag({ children, className }: FlagProps) {
  return <span className={['sx-flag', className].filter(Boolean).join(' ')}>{children}</span>;
}

export default Flag;
