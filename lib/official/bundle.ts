/**
 * The bundled official-fixture files `data/official/{bval,pcal,mcal}-2026.json` (SPEC §7.8): their
 * Zod schema, the deterministic serializer the build script writes them with, and the parser that
 * checks a file against config. The loader the cron and the tests read them through is
 * lib/official/bundle-file.ts.
 *
 * A bundle is a faithful transcription of the league's own document: `away`/`home` hold the
 * source's tokens (BVAL: registry slugs; PCAL: grid codes such as `STE`; MCAL: legend codes such
 * as `AW`). They are resolved ONLY through the league's own scope (`resolveOfficialName`, which
 * reads `officialCodes`/`officialNames`), never through the global resolver, so a code like `CAT`
 * or `U` can never land on another league's team. The file is validated at load (schema, league,
 * documents against config, ids); the double-round-robin checks live in lib/official/validate.ts.
 *
 * Never edit the JSON by hand: `pnpm build-official-fixtures` writes it.
 */

import { z } from 'zod';

import { leagueOfDivision } from '@/lib/config/leagues';
import { bundledDivisions } from '@/lib/config/leagues/official';
import type { BundleEvent, BundleFixture, OfficialFixture } from '@/lib/model/fixture';
import {
  type DivisionId, type LeagueId, OFFICIAL_SOURCE_IDS, type OfficialSourceId, type TeamSlug,
} from '@/lib/model/ids';
import { resolveOfficialName } from '@/lib/registry/resolve';
import { dateKey } from '@/lib/schema/primitives';
import { officialFixtureId } from '@/lib/shared/official-id';

export const OFFICIAL_BUNDLE_SCHEMA = 'scvalfh-official-fixtures/1';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');

export const BundleDocumentSchema = z.strictObject({
  division: z.string().min(1),
  url: z.url(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'expected a lowercase hex sha256'),
  /** The document's own revision text ("Revised 9/20/26"), when it prints one. */
  revisionMarker: z.string().min(1).nullable(),
});

export const BundleFixtureSchema = z.strictObject({
  /** `${division}:${date}:${awaySlug}@${homeSlug}` — the OfficialFixture id. */
  id: z.string().min(1),
  division: z.string().min(1),
  /** The official date (after any approved change). */
  date: dateKey,
  /** The originally published date when an approved change moved it (MCAL); else null. */
  originalDate: dateKey.nullable(),
  /** League-published varsity start. */
  time: HHMM.nullable(),
  /** Source token, resolved through the league scope only. */
  away: z.string().min(1),
  home: z.string().min(1),
  /** Source spelling, verbatim. */
  awayName: z.string().min(1),
  homeName: z.string().min(1),
}) satisfies z.ZodType<BundleFixture>;

export const BundleEventSchema = z.strictObject({
  kind: z.literal('play-in'),
  date: dateKey,
  time: HHMM.nullable(),
  verbatim: z.string().min(1),
}) satisfies z.ZodType<BundleEvent>;

export const OfficialBundleSchema = z.strictObject({
  schema: z.literal(OFFICIAL_BUNDLE_SCHEMA),
  league: z.string().min(1),
  source: z.enum(OFFICIAL_SOURCE_IDS),
  transcribedOn: dateKey,
  documents: z.array(BundleDocumentSchema).min(1),
  fixtures: z.array(BundleFixtureSchema).min(1),
  events: z.array(BundleEventSchema),
});

export type BundleDocument = z.infer<typeof BundleDocumentSchema>;
export type OfficialBundle = z.infer<typeof OfficialBundleSchema>;

/** Canonical bundle order: division (config order), then date, then id. */
export function compareBundleFixtures(a: BundleFixture, b: BundleFixture): number {
  const order = (d: DivisionId) => {
    const league = leagueOfDivision(d);
    return league.divisions.findIndex((x) => x.id === d);
  };
  return (
    order(a.division) - order(b.division) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Deterministic JSON: the top-level keys in schema order, two-space indent, and each document,
 * fixture and event on one line, so a revision diff reads one game per line.
 */
export function serializeBundle(bundle: OfficialBundle): string {
  const parsed = OfficialBundleSchema.parse(bundle);
  const ordered = {
    documents: parsed.documents.map((d) => ({
      division: d.division, url: d.url, sha256: d.sha256, revisionMarker: d.revisionMarker,
    })),
    fixtures: parsed.fixtures.map((f) => ({
      id: f.id, division: f.division, date: f.date, originalDate: f.originalDate, time: f.time,
      away: f.away, home: f.home, awayName: f.awayName, homeName: f.homeName,
    })),
    events: parsed.events.map((e) => ({ kind: e.kind, date: e.date, time: e.time, verbatim: e.verbatim })),
  };
  const list = (items: readonly unknown[]) =>
    items.length === 0 ? '[]' : `[\n${items.map((i) => `    ${JSON.stringify(i)}`).join(',\n')}\n  ]`;
  return [
    '{',
    `  "schema": ${JSON.stringify(parsed.schema)},`,
    `  "league": ${JSON.stringify(parsed.league)},`,
    `  "source": ${JSON.stringify(parsed.source)},`,
    `  "transcribedOn": ${JSON.stringify(parsed.transcribedOn)},`,
    `  "documents": ${list(ordered.documents)},`,
    `  "fixtures": ${list(ordered.fixtures)},`,
    `  "events": ${list(ordered.events)}`,
    '}',
    '',
  ].join('\n');
}

/** Resolve one bundle token through the league scope only (officialCodes, officialNames, then league members). */
function resolveToken(leagueId: LeagueId, token: string): TeamSlug | null {
  return resolveOfficialName(leagueId, token)?.slug ?? null;
}

/**
 * Parse a bundle and check it against config: the schema, the league id, the league's source id,
 * one document per bundled division whose sha256 equals `bundledSha256`, every fixture in a bundled
 * division of this league, and every fixture id equal to the id rebuilt from its resolved slugs.
 * Throws an Error listing every problem.
 */
export function parseOfficialBundle(raw: unknown, leagueId: LeagueId): OfficialBundle {
  const res = OfficialBundleSchema.safeParse(raw);
  if (!res.success) {
    throw new Error(`official bundle for ${leagueId}: schema: ${z.prettifyError(res.error)}`);
  }
  const bundle = res.data;
  const problems: string[] = [];
  const divisions = bundledDivisions(leagueId);
  const ids = new Set(divisions.map((d) => d.id));
  if (bundle.league !== leagueId) problems.push(`league is "${bundle.league}"`);
  for (const d of divisions) {
    if (d.official.source !== bundle.source) problems.push(`${d.id}: source is ${d.official.source}, file says ${bundle.source}`);
    const docs = bundle.documents.filter((doc) => doc.division === d.id);
    if (docs.length !== 1) problems.push(`${d.id}: ${docs.length} documents`);
    else if (docs[0].sha256 !== d.official.bundledSha256) problems.push(`${d.id}: document sha256 ≠ config bundledSha256`);
  }
  for (const doc of bundle.documents) {
    if (!ids.has(doc.division)) problems.push(`document for unknown division "${doc.division}"`);
  }
  for (const f of bundle.fixtures) {
    if (!ids.has(f.division)) {
      problems.push(`${f.id}: division "${f.division}" is not a bundled ${leagueId} division`);
      continue;
    }
    const away = resolveToken(leagueId, f.away);
    const home = resolveToken(leagueId, f.home);
    if (away === null) problems.push(`${f.id}: away "${f.away}" resolves to no ${leagueId} team`);
    if (home === null) problems.push(`${f.id}: home "${f.home}" resolves to no ${leagueId} team`);
    const id = officialFixtureId(f.division, f.date, { slug: away, name: f.awayName }, { slug: home, name: f.homeName });
    if (id !== f.id) problems.push(`${f.id}: id should be ${id}`);
  }
  if (problems.length > 0) {
    throw new Error(`official bundle for ${leagueId}: ${problems.join('; ')}`);
  }
  return bundle;
}

/** The bundle's fixtures as OfficialFixture rows (division order, then date, then id). */
export function bundleToFixtures(bundle: OfficialBundle): OfficialFixture[] {
  const leagueId = bundle.league;
  const source: OfficialSourceId = bundle.source;
  return [...bundle.fixtures].sort(compareBundleFixtures).map((f) => {
    const awaySlug = resolveToken(leagueId, f.away);
    const homeSlug = resolveToken(leagueId, f.home);
    return {
      id: officialFixtureId(f.division, f.date, { slug: awaySlug, name: f.awayName }, { slug: homeSlug, name: f.homeName }),
      league: leagueId,
      division: f.division,
      dateKey: f.date,
      time: f.time,
      awayName: f.awayName,
      homeName: f.homeName,
      awaySlug,
      homeSlug,
      source,
    };
  });
}
