/**
 * The zod form of a claims file AS WRITTEN (§6.5): `seenAt` may be left out (it is then the file's `fetchedAt`),
 * and a MaxPreps claim's game carries no `provenance.fetchedAt` (it is the claim's seenAt). lib/claims/file.ts
 * validates with it and restores both. A claim's game is checked against the snapshot's own GameSchema, so a
 * claim can hold nothing a published game could not.
 *
 * The rows of the sources no phase reads yet (si.com, cifsshome.org, the bracket sheet, VNN) are checked for
 * their keys only; the phase that starts reading each tightens its schema.
 */

import { z } from 'zod';

import { GUID_RE } from '../game-id';
import { formatIssues } from '../schema-primitives';
import { GameSchema, OfficialFixtureSchema, OfficialStampSchema, SBLIVE_ID_RE } from '../snapshot/snapshot-schema';
import { SPORT_IDS } from '../sports/current';
import {
  CLAIMS_SCHEMA_VERSION,
  MAXPREPS_GAME_OMITTED,
  MAXPREPS_PROVENANCE_KEYS,
  MULTI_CLAIM_SOURCES,
  RECONSTRUCTED_FIELDS,
  type ClaimSource,
} from './types';

const isoUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'expected an ISO UTC stamp');
const ref = z.string().min(1);
const seenAt = isoUtc.optional();
const scorePair = z.object({ home: z.number().int(), away: z.number().int() }).strict();
const row = z.looseObject({});

const MaxprepsClaimSchema = z
  .object({
    ref: ref.regex(GUID_RE, 'a MaxPreps claim is keyed by its contest GUID'),
    seenAt,
    // Checked whole in the file's refinement, against GameSchema with the claim's seenAt as provenance.fetchedAt.
    game: z.looseObject({ contestId: z.string(), provenance: z.looseObject({}) }),
    reconstructed: z.array(z.enum(RECONSTRUCTED_FIELDS as [string, ...string[]])).optional(),
  })
  .strict();

const EditorClaimSchema = z
  .object({
    ref,
    seenAt,
    fixture: z.looseObject({ dateKey: z.string(), home: z.string(), away: z.string(), sources: z.looseObject({}) }),
  })
  .strict();

const OfficialClaimSchema = z
  .object({
    ref,
    seenAt,
    fixture: OfficialFixtureSchema.optional(),
    stamp: OfficialStampSchema.optional(),
    lastMatch: z.object({ contestId: z.string().min(1), stamp: OfficialStampSchema }).strict().optional(),
  })
  .strict();

const SbliveClaimSchema = z
  .object({
    ref,
    seenAt,
    row: row.optional(),
    fill: z
      .union([
        z
          .object({
            rule: z.enum(['score-pending', 'contradictory-result', 'off-schedule-date', 'phantom-tie']),
            contestId: z.string().min(1),
            published: row,
          })
          .strict(),
        z
          .object({
            rule: z.literal('absent-fixture'),
            contestId: z.string().min(1),
            officialFixtureId: z.string().min(1),
            game: z.looseObject({ contestId: z.string() }),
          })
          .strict(),
      ])
      .optional(),
    conflict: z
      .object({ contestId: z.string().min(1), scoreConflict: z.object({ sblive: scorePair, note: z.string() }).strict(), published: scorePair })
      .strict()
      .optional(),
  })
  .strict();

const CifssClaimSchema = z
  .object({
    ref,
    seenAt,
    row: row.optional(),
    conflict: z.object({ contestId: z.string().min(1), cifss: scorePair, cifssUrl: z.string().min(1) }).strict().optional(),
  })
  .strict();

const SdsSheetClaimSchema = z
  .object({ ref, seenAt, result: row.optional(), fixture: row.optional(), host: z.string().min(1).optional() })
  .strict();

const VnnClaimSchema = z
  .object({
    ref,
    seenAt,
    event: row.optional(),
    applied: z
      .object({ venueName: z.string().optional(), venueAddress: row.optional(), timeConfirmed: z.literal(true).optional() })
      .strict()
      .optional(),
  })
  .strict();

const boxSide = z
  .object({
    goals: z.number().int().min(0).optional(),
    goalsAgainst: z.number().int().min(0).optional(),
    overtimeMinutes: z.number().min(0).optional(),
  })
  .strict();
const BoxClaimSchema = z.object({ ref, seenAt, sides: z.record(z.string(), boxSide) }).strict();

const FixtureClaimsSchema = z
  .object({
    maxpreps: MaxprepsClaimSchema.optional(),
    editor: EditorClaimSchema.optional(),
    official: OfficialClaimSchema.optional(),
    sblive: z.array(SbliveClaimSchema).optional(),
    cifss: z.array(CifssClaimSchema).optional(),
    sdsSheet: SdsSheetClaimSchema.optional(),
    vnn: z.array(VnnClaimSchema).optional(),
    box: BoxClaimSchema.optional(),
  })
  .strict();

const FixtureSchema = z
  .object({ id: z.string().min(1), aliases: z.array(z.string().min(1)).min(1).optional(), claims: FixtureClaimsSchema })
  .strict();

type DiskClaim = { ref: string; seenAt?: string } & Record<string, unknown>;

/** Every claim of a parsed fixture's claims, by source. */
function claimsOf(claims: Record<string, unknown>): Array<{ source: ClaimSource; claim: DiskClaim }> {
  const out: Array<{ source: ClaimSource; claim: DiskClaim }> = [];
  for (const [source, v] of Object.entries(claims)) {
    if (v === undefined) continue;
    for (const claim of Array.isArray(v) ? v : [v]) out.push({ source: source as ClaimSource, claim: claim as DiskClaim });
  }
  return out;
}

const sorted = (xs: readonly string[]): boolean => xs.every((x, i) => i === 0 || xs[i - 1] < x);

export const ClaimsFileSchema = z
  .object({
    schemaVersion: z.literal(CLAIMS_SCHEMA_VERSION),
    sport: z.enum(SPORT_IDS),
    fetchedAt: isoUtc,
    fixtures: z.array(FixtureSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    const issue = (path: PropertyKey[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    // Fixture ids unique and sorted (code-unit order).
    if (!sorted(file.fixtures.map((f) => f.id))) issue(['fixtures'], 'fixture ids are not unique and sorted');
    const held = new Map<string, string>();
    file.fixtures.forEach((f, i) => {
      const at = ['fixtures', i];
      if (f.aliases && !sorted(f.aliases)) issue([...at, 'aliases'], `${f.id}: aliases are not unique and sorted`);
      const all = claimsOf(f.claims as Record<string, unknown>);
      if (all.length === 0) issue(at, `${f.id}: a fixture with no claims`);
      for (const source of MULTI_CLAIM_SOURCES) {
        const list = (f.claims as Record<string, DiskClaim[] | undefined>)[source];
        if (list && !sorted(list.map((c) => c.ref))) issue([...at, 'claims', source], `${f.id}: ${source} claims are not unique and sorted by ref`);
      }
      // Each (source, ref) at most once across fixtures.
      for (const { source, claim } of all) {
        const key = `${source} ${claim.ref}`;
        const other = held.get(key);
        if (other !== undefined) issue([...at, 'claims', source], `${key} is held by ${other} and ${f.id}`);
        held.set(key, f.id);
      }

      const mp = f.claims.maxpreps;
      if (mp) {
        const where = [...at, 'claims', 'maxpreps'];
        const game = mp.game as Record<string, unknown> & { provenance: Record<string, unknown> };
        const seen = mp.seenAt ?? file.fetchedAt;
        if (game.contestId !== mp.ref) issue(where, `${f.id}: maxpreps game.contestId ${String(game.contestId)} is not its ref ${mp.ref}`);
        for (const key of MAXPREPS_GAME_OMITTED) if (key in game) issue(where, `${f.id}: a MaxPreps claim holds no ${key}`);
        if (game.countsFor !== null || game.postseason !== null) issue(where, `${f.id}: a MaxPreps claim's countsFor and postseason are null`);
        for (const key of Object.keys(game.provenance)) {
          if (!(MAXPREPS_PROVENANCE_KEYS as readonly string[]).includes(key)) issue(where, `${f.id}: provenance.${key} is not a MaxPreps provenance key`);
        }
        if ('fetchedAt' in game.provenance && game.provenance.fetchedAt !== seen) issue(where, `${f.id}: provenance.fetchedAt is not the claim's seenAt`);
        const parsed = GameSchema.safeParse({ ...game, provenance: { ...game.provenance, fetchedAt: seen } });
        if (!parsed.success) issue(where, `${f.id}: ${formatIssues(parsed.error.issues)}`);
      }

      const off = f.claims.official;
      if (off && !off.fixture && !off.stamp) issue([...at, 'claims', 'official'], `${f.id}: an official claim has a fixture or a stamp`);

      for (const [j, s] of (f.claims.sblive ?? []).entries()) {
        if (s.fill?.rule !== 'absent-fixture') continue;
        const parsed = GameSchema.safeParse(s.fill.game);
        const where = [...at, 'claims', 'sblive', j];
        if (!parsed.success) issue(where, `${f.id}: ${formatIssues(parsed.error.issues)}`);
        else if (!SBLIVE_ID_RE.test(parsed.data.contestId)) issue(where, `${f.id}: an absent-fixture fill's game has an sblive: id`);
      }
    });
  });

export type ClaimsFileOnDisk = z.infer<typeof ClaimsFileSchema>;
