import type { ReactNode } from 'react';

import { OG } from '@/views/site/og-theme';

/**
 * The blocks every OG card is built from, each returning exactly the element (and the style object,
 * key for key) the cards wrote out by hand, so a card renders to the same PNG through them.
 *
 * Every primitive returns ONE `<div>`, never a Fragment: satori lays a fragment out as one box
 * (components/og/LeagueStandingsCard.tsx, the stacked row's name and stats). Every box is
 * `display: 'flex'`, because satori requires it of any element with more than one child.
 */

/** The 1200×630 dark canvas: title block, body and footer pushed apart (`space-between`). */
export function OgFrame({ padding, children }: { padding: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding,
        background: OG.BG,
        color: OG.TEXT,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  );
}

/** The small uppercase line above a card's title or rule: `FINAL · BVAL · Santa Teresa`. */
export function OgKicker({ size, children }: { size: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: size,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: OG.TEXT_3,
      }}
    >
      {children}
    </div>
  );
}

/** The rule under a card's kicker or title. */
export function OgRule({ marginTop, weight = 2 }: { marginTop: number; weight?: number }) {
  return <div style={{ display: 'flex', marginTop, height: weight, background: OG.RULE }} />;
}

/** A card's title line; `marginTop` only when it follows a rule (satori rejects an `undefined` style value). */
export function OgTitle({ size, marginTop, children }: { size: number; marginTop?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        ...(marginTop === undefined ? {} : { marginTop }),
        fontSize: size,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

/** The one-line footer in the quietest grey: provenance, `unofficial`, the as-of stamp. */
export function OgFooter({ size, children }: { size: number; children: ReactNode }) {
  return <div style={{ display: 'flex', fontSize: size, color: OG.TEXT_3 }}>{children}</div>;
}
