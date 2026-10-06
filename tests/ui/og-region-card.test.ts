/**
 * The two-region leaders card (components/layout/og-region-card.tsx), shared by the root OG card and
 * the /standings card (DESIGN-socal §2.4; design-review UI §7): nine league rows in two region columns
 * must fit 1200×630 even when every division's leader line is at its longest.
 *
 * The fit is MEASURED, not estimated: each card is rendered by the same `ImageResponse` the routes use
 * (satori + resvg) in its `'natural'` sizing — the same blocks stacked with the minimum gaps, on a
 * canvas taller than the card — and the lowest painted pixel row, plus the card's bottom padding, is
 * the height the content needs. That has to be at most 630. The longest line of a division is the one
 * the leader clause can print: its two longest short names as co-leaders, then "+n", with two-digit
 * points (standings-view's `leaderClause`, the one builder of the row).
 */
import { inflateSync } from 'node:zlib';

import type { ReactElement } from 'react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { stubCorpusSnapshot } from '../helpers';

stubCorpusSnapshot('all-2026-10-02');

/** Decode an 8-bit RGB or RGBA, non-interlaced PNG (what resvg writes) to rows of pixels. */
function decodePng(buf: Buffer): { width: number; height: number; channels: number; rows: Buffer[] } {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('decodePng: only 8-bit, non-interlaced');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`decodePng: colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 0xff;
    }
    rows.push(line);
    prev = line;
  }
  return { width, height, channels, rows };
}

/** The lowest pixel row with a pixel unlike `bg` (default: the top-left pixel), or -1. */
function lowestPaintedRow(png: ReturnType<typeof decodePng>, bg: ArrayLike<number> = png.rows[0].subarray(0, png.channels)): number {
  for (let y = png.height - 1; y >= 0; y--) {
    const row = png.rows[y];
    for (let x = 0; x < png.width * png.channels; x += png.channels) {
      for (let k = 0; k < Math.min(3, png.channels); k++) {
        if (Math.abs(row[x + k] - bg[k]) > 8) return y;
      }
    }
  }
  return -1;
}

async function renderPng(element: ReactElement, height: number): Promise<ReturnType<typeof decodePng>> {
  const { ImageResponse } = await import('next/og');
  const response = new ImageResponse(element, { width: 1200, height });
  return decodePng(Buffer.from(await response.arrayBuffer()));
}

describe('the two-region leaders card (components/layout/og-region-card.tsx)', () => {
  it('lays the nine leagues out in two region columns, NorCal first', async () => {
    const { regionCardColumns } = await import('../../components/layout/og-region-card');
    const columns = regionCardColumns();
    expect(columns.map((c) => c.heading)).toEqual(['Northern California', 'Southern California']);
    expect(columns.map((c) => c.rows.map((r) => r.id))).toEqual([
      ['scval', 'bval', 'pcal', 'mcal', 'eal'],
      ['sunset', 'city', 'north-county', 'metro'],
    ]);
  });

  it('titles the cards from SITE_WORDMARK and counts leagues and teams in the footer', async () => {
    const { rootCardProps, standingsCardProps } = await import('../../components/layout/og-region-card');
    const root = rootCardProps();
    expect(root.title).toBe('California HS Field Hockey · 2026');
    expect(root.footer).toMatch(/^9 leagues · \d+ teams · (results through \S.*|no results yet) · unofficial$/);
    const standings = standingsCardProps();
    expect(standings.eyebrow).toBe('California HS Field Hockey');
    expect(standings.title).toBe('Standings — every league');
    expect(standings.footer).toMatch(/^9 leagues · \d+ teams( · results through \S.*)? · unofficial$/);
  });

  it('both cards fit 1200×630 with every leader line forced to its longest, and render as PNG', async () => {
    const card = await import('../../components/layout/og-region-card');
    const { getLeagueSummaries, getTeams } = await import('../../lib/data');
    const teams = getTeams();
    // Per division: the two longest short names as co-leaders of a three-way tie ("A & B +1 99 pts").
    const longest = card.regionCardColumns((leagueId) => {
      const league = getLeagueSummaries().find((l) => l.id === leagueId)!;
      return league.divisions.map((d) => {
        const names = teams
          .filter((t) => t.division === d.id)
          .map((t) => t.shortName)
          .sort((a, b) => b.length - a.length);
        return {
          division: d.id,
          heading: d.heading,
          teams: [names[0], names[1] ?? names[0], names[2] ?? names[0]].map((name) => ({ name, record: '9-9-9', pts: 99 })),
          tiedAtTop: true,
        };
      });
    });
    expect(longest.flatMap((c) => c.rows).every((r) => r.text.includes(' +1 99 pts'))).toBe(true);

    for (const [name, props] of [
      ['root', card.rootCardProps(longest)],
      ['/standings', card.standingsCardProps(longest)],
    ] as const) {
      // The natural height: the same blocks at their minimum gaps, on a white canvas taller than the
      // card, so the card's own dark box (bottom padding included) ends at its lowest painted row.
      const natural = await renderPng(
        createElement(
          'div',
          { style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#ffffff' } },
          createElement(card.RegionCard, { ...props, sizing: 'natural' }),
        ),
        1000,
      );
      const needed = lowestPaintedRow(natural, [255, 255, 255]) + 1;
      expect(needed, `${name} card: height the content needs with the longest leader lines`).toBeLessThanOrEqual(630);
      // And the card itself renders at its real size.
      const fixed = await renderPng(createElement(card.RegionCard, props), 630);
      expect([fixed.width, fixed.height], `${name} card PNG`).toEqual([1200, 630]);
      // The footer is the last block: something is painted in the bottom padding's band above it.
      expect(lowestPaintedRow(fixed), `${name} card: footer on the card`).toBeGreaterThan(630 - card.REGION_CARD.paddingY - 40);
      expect(lowestPaintedRow(fixed)).toBeLessThan(630 - card.REGION_CARD.paddingY + 6);
    }
  }, 120_000);

  it('the routes render with the snapshot’s own leaders', async () => {
    const root = await import('../../app/opengraph-image');
    const standings = await import('../../app/standings/opengraph-image');
    for (const [name, mod] of [
      ['app/opengraph-image.tsx', root],
      ['app/standings/opengraph-image.tsx', standings],
    ] as const) {
      expect(mod.size, name).toEqual({ width: 1200, height: 630 });
      const response = mod.default();
      const png = decodePng(Buffer.from(await response.arrayBuffer()));
      expect([png.width, png.height], name).toEqual([1200, 630]);
    }
  }, 120_000);
});
