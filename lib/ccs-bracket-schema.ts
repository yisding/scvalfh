/**
 * The Zod contract for data/ccs-bracket-2026.json — the CCS field hockey championship's seeds, transcribed by
 * hand from the MaxPreps tournament page (CCS.bracketUrl) once the CCS committee's seeding meeting (Mon Nov 2,
 * 1:00 PM) has been entered there, so lib/ccs-bracket.ts getCcsSeeds() can put a seed beside each team in
 * the bracket the site draws from `playoffs.games`.
 *
 * Why a hand-entered file (decided 2026-10-29, plan final-05): a published MaxPreps bracket page is server
 * HTML (round headers, each team's seed, score and `?c=<contestId>` link), but no published page has ever
 * been captured, so a parser would be written blind; MaxPreps' schedule feeds give the game, the division
 * and `bracketIsPublished`, never a seed. The owner copies the 16 seeds in once (about ten minutes) and runs
 * `pnpm test` before committing — the suite runs tests/ccs-bracket-file.test.ts, and the data cron's own
 * Test step gates its commit on the suite. Until then the file is the placeholder `{ season, retrievedOn:
 * null, source: null, divisions: [] }` and the bracket prints no seed (getCcsSeeds() is null). A pipeline
 * seed parser is a follow-up (P2), and this file is its switch: when a parser lands, the owner file wins
 * while it is non-empty.
 *
 * What this contract guards, on the lib/history-brackets-schema.ts pattern: a slip cannot reach the page.
 * `divisions` is empty or exactly the two CCS divisions in config order (CCS.ccsDivisions: 'Division 1',
 * 'Division 2'); each has exactly eight seeds numbered 1..8 — MaxPreps and the CCS bracket sheets number
 * each division 1-8, and the committee's 9-16 for Division 2 is a grouping, never a printed number
 * (data/history-brackets-2025-26.json shows both divisions seeded 1-8); every slug is a registry team of a
 * league with `sectionId === 'ccs'` (SCVAL, BVAL, PCAL) and appears once in the whole file; `retrievedOn`
 * and `source` are required as soon as a division is filled.
 */

import { z } from 'zod';

import { CCS, LEAGUE_IDS, getLeague } from './leagues';
import { dateKey, httpsUrl, slugId } from './schema-primitives';
import { teamsInLeague } from './teams';
import type { CcsDivisionName } from './types';

/** Seeds per CCS division: MaxPreps and the CCS bracket sheets number each division 1-8. */
export const CCS_DIVISION_SIZE = 8;

/** Every registry team of a CCS league, by slug (read at call time so tests can mock the leagues). */
function ccsSlugs(): ReadonlySet<string> {
  return new Set(
    LEAGUE_IDS.filter((l) => getLeague(l).sectionId === 'ccs').flatMap((l) => teamsInLeague(l).map((t) => t.slug)),
  );
}

const seed = z.object({
  seed: z.number().int().min(1).max(CCS_DIVISION_SIZE),
  slug: slugId,
});

const division = z
  .object({
    name: z.enum(['Division 1', 'Division 2']),
    seeds: z.array(seed).length(CCS_DIVISION_SIZE, `a CCS division has exactly ${CCS_DIVISION_SIZE} seeds`),
  })
  .refine(
    (d) => [...d.seeds].map((s) => s.seed).sort((a, b) => a - b).every((n, i) => n === i + 1),
    `seeds must be numbered 1..${CCS_DIVISION_SIZE}, each once (MaxPreps and the CCS number each division 1-8; 9-16 is the committee's grouping, not a printed seed)`,
  );

export const CcsSeedFileSchema = z
  .object({
    season: z.string().min(1),
    /** The day the page was read; null only while the file is the placeholder. */
    retrievedOn: dateKey.nullable(),
    /** What the page links as the source; null only while the file is the placeholder. */
    source: z.object({ label: z.string().min(1), url: httpsUrl }).nullable(),
    divisions: z.array(division),
  })
  .refine(
    (f) => f.divisions.length === 0 || f.divisions.map((d) => d.name).join('|') === CCS.ccsDivisions.map((d) => d.name).join('|'),
    `divisions must be empty or exactly ${CCS.ccsDivisions.map((d) => `'${d.name}'`).join(', ')} in that order`,
  )
  .refine((f) => f.divisions.length === 0 || (f.retrievedOn !== null && f.source !== null), 'retrievedOn and source are required once a division is filled')
  .superRefine((f, ctx) => {
    const slugs = ccsSlugs();
    const seen = new Set<string>();
    f.divisions.forEach((d, di) => {
      d.seeds.forEach((s, si) => {
        if (!slugs.has(s.slug)) {
          ctx.addIssue({ code: 'custom', path: ['divisions', di, 'seeds', si, 'slug'], message: `${s.slug} is not a registry team of a CCS league` });
        }
        if (seen.has(s.slug)) {
          ctx.addIssue({ code: 'custom', path: ['divisions', di, 'seeds', si, 'slug'], message: `${s.slug} is seeded twice` });
        }
        seen.add(s.slug);
      });
    });
  });

export type CcsSeedFile = z.infer<typeof CcsSeedFileSchema>;
export type CcsSeedDivision = CcsSeedFile['divisions'][number];
export type CcsSeed = CcsSeedDivision['seeds'][number];

/** The seeds the site shows, with where they came from (lib/ccs-bracket.ts getCcsSeeds). */
export interface CcsSeeds {
  season: string;
  retrievedOn: string;
  source: { label: string; url: string };
  /** 'owner-file' = data/ccs-bracket-2026.json; a pipeline parser would add its own value. */
  provenance: 'owner-file';
  divisions: Array<{ name: CcsDivisionName; seeds: CcsSeed[] }>;
}
