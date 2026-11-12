import Dateline from './Dateline';

/**
 * The page title block (DESIGN §33), for pages whose title is their identity: a team's name, "SCVAL
 * standings", "Leaders", "About". The h1 is the condensed title face at 36–60px (the base `h1` rule
 * and the `text-h1` theme value are the same numbers); a long title wraps, it is never clipped.
 * Under it, at most ONE plain line (`meta`), and a right-hand slot (`end`). No sentence under a
 * title, and no grey line by default.
 *
 * Score pages (home included) pass `titleHidden`: the h1 is visually hidden and nothing else is
 * drawn, because the selected cell of the date bar is the visible title.
 *
 * The team page passes `lead` (its logo) and `figures` (its record as figures, not a label line).
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
  /** Score pages (home included): the h1 is sr-only and the header renders nothing visible. */
  titleHidden?: boolean;
  /** ONE plain line under the title (team: "SCVAL De Anza"). Not prose, not a list of facts. */
  meta?: React.ReactNode;
  /** Team page only: the record as figures (value over a small label). */
  figures?: ReadonlyArray<{ label: string; value: string }>;
  /** Right-hand slot: the team page's pin state; elsewhere the short Updated stamp when the page has no league row. */
  end?: React.ReactNode;
  /** Team page only: the logo (the 64px file; CSS draws it at 48px below 768). Adds the class `sx-teamhead`. */
  lead?: React.ReactNode;
  /** Appends the long "Updated …" stamp to the meta line. Default FALSE; only /about passes true. */
  stamp?: boolean;
  /** The page's controls (ScopeBar, tabs), rendered under the header. */
  children?: React.ReactNode;
  className?: string;
  /**
   * @deprecated accepted until pages migrate; rendered as a plain 14px line UNDER the title (never a
   * kicker above it). It is still drawn because /clubs/[slug] passes its only link back to /clubs here.
   */
  eyebrow?: React.ReactNode;
  /** @deprecated accepted until pages migrate; rendered as a plain 14px line. */
  description?: React.ReactNode;
  /** @deprecated accepted until pages migrate. */
  aside?: React.ReactNode;
  /** @deprecated accepted until pages migrate. */
  asideClassName?: string;
}

export function PageHeader({
  title,
  srTitle,
  titleHidden = false,
  meta,
  figures,
  end,
  lead,
  stamp = false,
  children,
  className,
  eyebrow,
  description,
  aside,
  asideClassName,
}: PageHeaderProps) {
  if (titleHidden) {
    return (
      <>
        <h1 className="sr-only">
          {title}
          {srTitle ? <span className="sr-only">{srTitle}</span> : null}
        </h1>
        {children}
      </>
    );
  }
  return (
    <header className={['sx-pagehead', lead ? 'sx-teamhead' : null, className].filter(Boolean).join(' ')}>
      {lead}
      <h1 className="m-0 text-h1 text-ink">
        {title}
        {srTitle ? <span className="sr-only">{srTitle}</span> : null}
      </h1>
      {end ? <div className="sx-pagehead-end">{end}</div> : null}
      {meta || stamp ? (
        // A <div>, not a <p>: un-migrated pages still pass a paragraph of their own as `meta`.
        <div className="sx-pagehead-meta">
          {meta}
          {stamp ? <Dateline /> : null}
        </div>
      ) : null}
      {figures ? (
        <dl className="sx-figures">
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {eyebrow ? <p className="sx-dateline">{eyebrow}</p> : null}
      {description ? <p className="sx-dateline">{description}</p> : null}
      {aside ? <div className={asideClassName}>{aside}</div> : null}
      {children}
    </header>
  );
}

export default PageHeader;
