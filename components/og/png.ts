import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';

import { OG_SIZE } from '@/views/site/og-theme';

/**
 * One card element as the PNG response an `opengraph-image.tsx` route returns: `ImageResponse`
 * (satori + resvg) at the card's size, 1200×630 unless the caller says otherwise.
 */
export function ogPng(node: ReactElement, size: { width: number; height: number } = OG_SIZE): ImageResponse {
  return new ImageResponse(node, { ...size });
}
