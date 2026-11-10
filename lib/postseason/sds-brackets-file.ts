/**
 * data/sds-brackets-2026.json, imported so the build bundles it (a Worker has no project filesystem; see
 * lib/data.ts) and validated once at module scope, so a slip in the hand-entered file fails the build rather
 * than drawing a wrong bracket. Read by lib/postseason/sds-bracket.ts (the brackets) and by the pipeline's
 * read of the Section's bracket sheet (lib/postseason/sds-sheet-results.ts), which needs each division's teams
 * and places. Nothing here reads the snapshot.
 */

import bundledFileFieldHockey from '../../data/sds-brackets-2026.json';
import bundledFileBasketball from '../../data/basketball/sds-brackets-2026.json';
import bundledFileSoccer from '../../data/soccer/sds-brackets-2026.json';
import { validateData } from '../data-file';
import type { TeamSlug } from '../types';
import { IS_BASKETBALL, IS_FIELD_HOCKEY } from '../sports/current';
import { SdsBracketsSchema, type SdsBracketsDivision, type SdsBracketsFile } from './sds-brackets-schema';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundledFile = IS_FIELD_HOCKEY ? bundledFileFieldHockey : IS_BASKETBALL ? bundledFileBasketball : bundledFileSoccer;

function loadFile(): SdsBracketsFile {
  return validateData('sds-brackets-2026', SdsBracketsSchema, bundledFile);
}

export const SDS_BRACKETS_FILE: SdsBracketsFile = loadFile();

/** Every team in a division's bracket: its placed teams and both play-in teams. */
export function sdsDivisionTeams(div: SdsBracketsDivision): TeamSlug[] {
  return [...div.seeds.map((s) => s.slug), ...(div.playIn ? [div.playIn.home, div.playIn.away] : [])];
}

/** A team's numbered place in its division (a play-in team's is the place it plays for), or null. */
export function sdsPlaceOf(div: SdsBracketsDivision, slug: TeamSlug): number | null {
  const placed = div.seeds.find((s) => s.slug === slug);
  if (placed) return placed.seed;
  if (div.playIn && (div.playIn.home === slug || div.playIn.away === slug)) return div.playIn.forSeed;
  return null;
}
