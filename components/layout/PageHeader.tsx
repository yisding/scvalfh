import Dateline from './Dateline';

/**
 * The page title block (DESIGN §33): the h1, the dateline (a sentence or two about the page, ending
 * in the freshness stamp), then the page's controls row. It opens every route except /game/[id],
 * whose h1 stays sr-only beside the scoreboard, and the team page, whose TeamIdentity holds its own.
 * One column at every width: nothing sits beside the title.
 *
 * Server-only (Dateline reads the snapshot): a client module such as app/error.tsx writes the same
 * `<header className="sx-pagehead">` by hand.
 *
 * Class strings are built with `[…].filter(Boolean).join(' ')`, never glued to a template
 * interpolation: Tailwind's scanner does not extract such a candidate
 * (tests/ui/class-join.test.ts holds the rule site-wide).
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  /** Appended inside the h1 as sr-only text (e.g. " — scores, standings and the CCS playoff picture"). */
  srTitle?: string;
  /** One or two sentences, at most about 120 characters; `<b>` the lead clause. */
  dateline?: React.ReactNode;
  /** Appends "Updated … PT." to the dateline. Default true. */
  stamp?: boolean;
  /** The controls row (ScopeBar, tabs), rendered right under the dateline. */
  children?: React.ReactNode;
  className?: string;
  /** @deprecated accepted until pages migrate: rendered as the first sentence of the dateline. */
  eyebrow?: React.ReactNode;
  /** @deprecated accepted until pages migrate: use `dateline`. */
  description?: React.ReactNode;
  /** @deprecated accepted until pages migrate. */
  meta?: React.ReactNode;
  /** @deprecated accepted until pages migrate: use `children`. */
  aside?: React.ReactNode;
  /** @deprecated accepted until pages migrate. */
  asideClassName?: string;
}

/** 'Fri Sep 19' → 'Fri Sep 19.': a deprecated eyebrow or description ends as a sentence before what follows it. */
function sentence(words: React.ReactNode): React.ReactNode {
  return typeof words === 'string' && !/[.!?:]$/.test(words) ? `${words}.` : words;
}

export function PageHeader({
  title,
  srTitle,
  dateline,
  stamp = true,
  children,
  className,
  eyebrow,
  description,
  meta,
  aside,
  asideClassName,
}: PageHeaderProps) {
  const words = dateline ?? description;
  return (
    <header className={['sx-pagehead', className].filter(Boolean).join(' ')}>
      <h1 className="m-0 text-h1 text-ink">
        {title}
        {srTitle ? <span className="sr-only">{srTitle}</span> : null}
      </h1>
      <Dateline stamp={stamp}>
        {eyebrow || words ? (
          <>
            {eyebrow ? sentence(eyebrow) : null}
            {eyebrow && words ? ' ' : null}
            {dateline === undefined ? sentence(words) : words}
          </>
        ) : null}
      </Dateline>
      {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-2">{meta}</div> : null}
      {aside ? <div className={['mt-4', asideClassName].filter(Boolean).join(' ')}>{aside}</div> : null}
      {children}
    </header>
  );
}

export default PageHeader;
