/**
 * The CCS bracket's data: which games are the bracket, and the seeds beside them (plan final-05, 2026-10-29).
 *
 * `ccsBracketGames` is the one derivation of `playoffs.games` (lib/types.ts CcsPlayoffs): every game tagged
 * 'ccs' (lib/classify.ts rules 1c, 2 and 2b) that is dated on or after the quarterfinals (CCS.keyDates), or
 * that MaxPreps' own feed marks as a published bracket game (`Game.bracket.published`, lib/normalize.ts) —
 * the committee enters the bracket on Mon Nov 2 and the games appear on the team feeds that evening, five
 * days before the first round, so the date alone would leave the bracket empty until Nov 7. The result holds
 * the SAME `Game` objects as `snapshot.games`, in `byDateThenId` order, so every `gameHref` resolves and a
 * score is written once. lib/pipeline/steps/assemble.ts calls it when the snapshot is built;
 * lib/snapshot-migrate.ts rebuilds a committed file's `playoffs.games` on load when it no longer matches
 * (needsPlayoffGames), the way stale tags are reclassified, so a file written before this derivation
 * existed heals itself.
 *
 * `getCcsSeeds` is the seed switch: the owner file data/ccs-bracket-2026.json when it is filled
 * (lib/ccs-bracket-schema.ts says what it guards and why it is hand-entered), else null — a bracket with no
 * seeds prints no seed, never a guessed one (DESIGN §7.11). `seedsFromHistory` turns a 2025 bracket from
 * data/history-brackets-2025-26.json into the same file shape, which is how the schema is proved against a
 * real sixteen-seed field before the 2026 file exists.
 */

import bundledFile from '../data/ccs-bracket-2026.json';
import { CcsSeedFileSchema, type CcsSeedFile, type CcsSeeds } from './ccs-bracket-schema';
import { byDateThenId } from './format';
import type { SectionBracket } from './history-brackets-schema';
import { failValidation } from './schema-primitives';
import type { CcsDivisionName, CcsKeyDates, Game } from './types';

/**
 * The CCS bracket games among `games`: tagged 'ccs' and (dated on or after the quarterfinals, or marked
 * published by MaxPreps' feed). The same objects, sorted by date then id. A crossover or play-in is never one,
 * whatever its date: its tag is its league's.
 */
export function ccsBracketGames(games: readonly Game[], keyDates: Pick<CcsKeyDates, 'quarterfinals'>): Game[] {
  return games
    .filter((g) => g.postseason?.kind === 'ccs' && (g.bracket?.published === true || g.dateKey >= keyDates.quarterfinals))
    .sort(byDateThenId);
}

/** True when `playoffs.games` (by contestId, in order) is not what `ccsBracketGames` derives from `games`. */
export function playoffGamesStale(
  games: readonly Game[],
  playoffGames: readonly Pick<Game, 'contestId'>[],
  keyDates: Pick<CcsKeyDates, 'quarterfinals'>,
): boolean {
  const derived = ccsBracketGames(games, keyDates).map((g) => g.contestId);
  return derived.length !== playoffGames.length || derived.some((id, i) => id !== playoffGames[i].contestId);
}

/** The owner file, validated once at import (a bad file fails the build and `pnpm test`, never a render). */
function loadSeedFile(): CcsSeedFile {
  const parsed = CcsSeedFileSchema.safeParse(bundledFile);
  if (!parsed.success) failValidation('ccs-bracket', parsed.error.issues);
  return parsed.data;
}

const seedFile = loadSeedFile();

/**
 * The CCS seeds to show: the owner file when it is filled, else null (no seed is printed). A pipeline parser
 * of the published MaxPreps page would slot in behind the owner file here (P2).
 */
export function getCcsSeeds(file: CcsSeedFile = seedFile): CcsSeeds | null {
  if (file.divisions.length === 0 || file.retrievedOn === null || file.source === null) return null;
  return {
    season: file.season,
    retrievedOn: file.retrievedOn,
    source: { ...file.source },
    provenance: 'owner-file',
    divisions: file.divisions.map((d) => ({ name: d.name, seeds: d.seeds.map((s) => ({ ...s })) })),
  };
}

/** The seed of one team in one division, or null when the file names neither. */
export function ccsSeedOf(seeds: CcsSeeds | null, division: CcsDivisionName, slug: string | null): number | null {
  if (!seeds || slug === null) return null;
  return seeds.divisions.find((d) => d.name === division)?.seeds.find((s) => s.slug === slug)?.seed ?? null;
}

/**
 * A section bracket of data/history-brackets-2025-26.json (the CCS's: two divisions, a first round of four
 * seeded games each) as a seed file: the sixteen seeded sides of the first round, one division at a time, each
 * division's label as its name. Used by tests/ccs-bracket-file.test.ts to prove the schema against a real
 * field; a maintainer can use the same shape to check a hand-entered 2026 file.
 */
export function seedsFromHistory(bracket: SectionBracket, season: string): CcsSeedFile {
  return {
    season,
    retrievedOn: bracket.retrievedOn,
    source: { label: bracket.sources[0].label, url: bracket.sources[0].url },
    divisions: bracket.divisions.map((d) => ({
      name: d.label as CcsDivisionName,
      seeds: d.rounds[0].games
        .flatMap((g) => [g.top, g.bottom])
        .map((s) => ({ seed: s.seed, slug: s.slug }))
        .sort((a, b) => a.seed - b.seed),
    })),
  };
}
