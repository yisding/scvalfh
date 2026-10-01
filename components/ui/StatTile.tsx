import Link from 'next/link';

import { EM_DASH } from '../../lib/format';

/**
 * A headline number (DESIGN §7.7). No border, no background — whitespace and the hairline above
 * the row do the separating. No sparkline anywhere on this site (§6.2, R-13). A `null` renders
 * an em dash and the tile keeps its full footprint, so the row never reflows.
 */
export interface StatTileProps {
  label: string;
  value: string | number | null;
  /** "league games only", "7th of 8" */
  sub?: string;
  /** 'hero' = the top of the text-figure clamp. ONE per view. */
  emphasis?: 'default' | 'hero';
  href?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  sub,
  emphasis = 'default',
  href,
  className,
}: StatTileProps) {
  const body = (
    <>
      <span
        className={`sx-figure block ${
          emphasis === 'hero' ? 'text-figure' : 'text-[1.75rem] leading-none tracking-[-0.02em]'
        } font-semibold text-ink`}
      >
        {value === null ? <span aria-label="not reported">{EM_DASH}</span> : value}
      </span>
      <span className="mt-1.5 block font-mono text-kicker font-semibold tracking-[0.10em] uppercase text-ink-3">
        {label}
      </span>
      {sub ? <span className="mt-1 block text-meta text-ink-2">{sub}</span> : null}
    </>
  );
  return (
    // NB: the literal must not sit immediately before `${`. Tailwind v4's scanner does not
    // extract a candidate that runs straight into an interpolation, so written that way this
    // tile silently lost its 76px min-height in the built CSS (DESIGN §7.7).
    <div className={['min-h-[4.75rem]', className].filter(Boolean).join(' ')}>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and tiles come in rows of five. Navigation still fetches on click. */}
      {href ? (
        <Link href={href} prefetch={false} className="block no-underline hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export default StatTile;
