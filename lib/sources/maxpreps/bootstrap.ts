/** The season bootstrap: parsing https://www.maxpreps.com/ca/field-hockey/ for its season ids (SPEC §1.1h). */

import { BOOTSTRAP_URL } from '@/lib/config/season';

import { MaxPrepsError } from './error';
import { BootstrapNextDataSchema } from './schemas';

export interface Bootstrap {
  sportSeasonId: string | null;
  allSeasonId: string | null;
  genderSport: string | null;
  teamLevel: string | null;
}

/**
 * ⚠️ The tag carries `crossorigin="anonymous"` BETWEEN `id` and `type`, so a regex that assumes
 * `type=` follows `id=` immediately fails (SPEC §1.1h, verdicts 5/9/11).
 */
export const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export function extractNextData(html: string): unknown {
  const m = NEXT_DATA_RE.exec(html);
  if (!m) throw new MaxPrepsError('__NEXT_DATA__ script tag not found', { url: BOOTSTRAP_URL });
  try {
    return JSON.parse(m[1]) as unknown;
  } catch (err) {
    throw new MaxPrepsError(`__NEXT_DATA__ is not JSON: ${(err as Error).message}`, {
      url: BOOTSTRAP_URL,
    });
  }
}

export function parseBootstrap(html: string): Bootstrap {
  const parsed = BootstrapNextDataSchema.parse(extractNextData(html));
  const q = parsed.query;
  const gsd = parsed.props?.pageProps?.navBarProps?.genderSportData;
  return {
    sportSeasonId: q?.ssid ?? q?.sportSeasonId ?? null,
    allSeasonId: q?.allSeasonId ?? gsd?.allSeasonId ?? null,
    genderSport: q?.gendersport ?? gsd?.genderSportId ?? null,
    teamLevel: q?.teamLevel ?? gsd?.teamLevel ?? null,
  };
}
